#!/usr/bin/env python3
"""Daemon TTS tiếng Việt dùng VieNeu-TTS (ONNX, CPU/GPU).

Chạy dưới dạng singleton theo người dùng qua Unix socket: tiến trình đầu tiên
sở hữu socket và nạp model; các tiến trình sau trở thành proxy nối vào socket
đó. Nhờ vậy dù OpenCode nạp plugin nhiều lần cũng chỉ có một engine và một
luồng phát âm.

Giao thức JSON lines trên stdin/stdout:

  -> {"cmd": "speak", "id": "...", "text": "..."}
  -> {"cmd": "stop"}
  -> {"cmd": "set_voice", "voice": "Mai Anh"}
  -> {"cmd": "voices"}
  -> {"cmd": "ping"}
  -> {"cmd": "shutdown"}

  <- {"event": "loading"} | {"event": "ready", ...} | {"event": "spoken", "id": "..."}
  <- {"event": "stopped"} | {"event": "voice", ...} | {"event": "voices", ...}
  <- {"event": "error", "message": "..."}
"""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field

# ONNX Runtime từ chối file external-data nằm ngoài thư mục model; cache HuggingFace
# mặc định dùng symlink nên phải tắt symlink để hub copy file thật vào snapshot.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.environ.get("VOICE_TTS_ASSETS") or SCRIPT_DIR
RUNTIME_DIR = os.environ.get("VOICE_TTS_HOME") or ASSETS_DIR
os.makedirs(RUNTIME_DIR, exist_ok=True)
LOGS_DIR = os.path.join(RUNTIME_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

if ASSETS_DIR not in sys.path:
    sys.path.insert(0, ASSETS_DIR)

ENGINE = os.environ.get("TTS_ENGINE", "vieneu")
SOCKET_PATH = os.path.join(RUNTIME_DIR, f"daemon-{ENGINE}.sock")
LOG_PATH = os.path.join(LOGS_DIR, f"daemon-{ENGINE}.log")

import importlib  # noqa: E402

engine = importlib.import_module(f"engine_{ENGINE}")

_CLIENTS: list[socket.socket] = []
_CLIENTS_LOCK = threading.Lock()


def emit(payload: dict) -> None:
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    try:
        sys.stdout.write(line)
        sys.stdout.flush()
    except Exception:
        pass
    with _CLIENTS_LOCK:
        targets = list(_CLIENTS)
    for conn in targets:
        try:
            conn.sendall(line.encode("utf-8"))
        except OSError:
            with _CLIENTS_LOCK:
                if conn in _CLIENTS:
                    _CLIENTS.remove(conn)


def log(message: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}\n"
    try:
        sys.stderr.write(f"[vieneu-daemon] {message}\n")
        sys.stderr.flush()
    except Exception:
        pass
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError:
        pass


@dataclass
class State:
    tts: object | None = None
    voice: str = ""
    voices: list = field(default_factory=list)
    clone_refs: dict = field(default_factory=dict)
    player: subprocess.Popen | None = None
    pending: dict | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    wake: threading.Event = field(default_factory=threading.Event)
    ready: bool = False
    shutdown: bool = False
    tmpdir: str = field(default_factory=lambda: tempfile.mkdtemp(prefix="tts-"))


def emit_snapshot(state: State) -> None:
    event = "ready" if state.ready else "loading"
    emit({"event": event, "voice": state.voice, "voices": state.voices})


def submit(state: State, command: dict) -> None:
    name = command.get("cmd")
    if name == "shutdown":
        return
    with state.lock:
        state.pending = command
    state.wake.set()


def stop_player(state: State) -> None:
    with state.lock:
        player = state.player
        state.player = None
    if player and player.poll() is None:
        try:
            player.terminate()
        except Exception:
            pass


def load_model(state: State) -> None:
    engine.load(state, log)
    state.ready = True
    emit_snapshot(state)


def synthesize(state: State, text: str) -> str:
    path, _sample_rate = engine.synthesize(state, text, log)
    return path


def play(state: State, path: str) -> int:
    with state.lock:
        state.player = subprocess.Popen(["afplay", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        player = state.player
    code = player.wait()
    with state.lock:
        if state.player is player:
            state.player = None
    return code


def handle_once(state: State, command: dict) -> None:
    name = command.get("cmd")
    if name == "stop":
        stop_player(state)
        emit({"event": "stopped"})
        return

    if name == "ping":
        emit_snapshot(state)
        return

    if name == "voices":
        emit({"event": "voices", "voice": state.voice, "voices": state.voices})
        return

    if name == "set_voice":
        state.voice = str(command.get("voice") or "")
        emit({"event": "voice", "voice": state.voice})
        return

    if name != "speak":
        emit({"event": "error", "message": f"lệnh không hỗ trợ: {name}"})
        return

    identifier = str(command.get("id") or "")
    text = str(command.get("text") or "").strip()
    if not text:
        emit({"event": "spoken", "id": identifier})
        return

    stop_player(state)
    try:
        started = time.time()
        path = synthesize(state, text)
        elapsed = time.time() - started
        try:
            import soundfile as sf

            duration = sf.info(path).duration
            rtf = elapsed / duration if duration else 0.0
            log(f"tổng hợp {elapsed:.2f}s cho {duration:.2f}s audio (RTF {rtf:.2f})")
        except Exception:
            log(f"tổng hợp xong sau {elapsed:.2f}s")
    except Exception as error:
        emit({"event": "error", "id": identifier, "message": str(error)})
        return

    code = play(state, path)
    if code not in (0, -signal.SIGTERM, -signal.SIGKILL):
        emit({"event": "error", "id": identifier, "message": f"afplay thoát với mã {code}"})
    else:
        emit({"event": "spoken", "id": identifier})
    try:
        os.remove(path)
    except OSError:
        pass


def worker(state: State) -> None:
    while not state.shutdown:
        state.wake.wait(timeout=0.25)
        state.wake.clear()
        if state.shutdown:
            return
        with state.lock:
            command = state.pending
            state.pending = None
        if not command:
            continue
        try:
            handle_once(state, command)
        except Exception as error:  # pragma: no cover
            emit({"event": "error", "message": str(error)})


# ---------------------------------------------------------------- singleton ---


def existing_server_alive() -> bool:
    if not os.path.exists(SOCKET_PATH):
        return False
    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    try:
        probe.connect(SOCKET_PATH)
        return True
    except OSError:
        return False
    finally:
        probe.close()


def run_proxy() -> int:
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.connect(SOCKET_PATH)
    stop = threading.Event()

    def socket_to_stdout() -> None:
        try:
            for line in client.makefile("r", encoding="utf-8"):
                sys.stdout.write(line)
                sys.stdout.flush()
        except OSError:
            pass
        finally:
            stop.set()

    def stdin_to_socket() -> None:
        try:
            for line in sys.stdin:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    if json.loads(stripped).get("cmd") == "shutdown":
                        break
                except json.JSONDecodeError:
                    pass
                client.sendall(stripped.encode("utf-8") + b"\n")
        except OSError:
            pass
        finally:
            stop.set()

    threading.Thread(target=socket_to_stdout, daemon=True).start()
    threading.Thread(target=stdin_to_socket, daemon=True).start()
    stop.wait()
    try:
        client.close()
    except OSError:
        pass
    return 0


def run_server() -> int:
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(8)
    os.chmod(SOCKET_PATH, 0o600)

    state = State()
    threading.Thread(target=worker, args=(state,), daemon=True).start()

    def submit_connection(conn: socket.socket) -> None:
        try:
            for line in conn.makefile("r", encoding="utf-8"):
                line = line.strip()
                if not line:
                    continue
                try:
                    submit(state, json.loads(line))
                except json.JSONDecodeError:
                    emit({"event": "error", "message": "JSON không hợp lệ"})
        except OSError:
            pass
        finally:
            with _CLIENTS_LOCK:
                if conn in _CLIENTS:
                    _CLIENTS.remove(conn)
            try:
                conn.close()
            except OSError:
                pass

    def accept_loop() -> None:
        while not state.shutdown:
            try:
                conn, _ = server.accept()
            except OSError:
                return
            with _CLIENTS_LOCK:
                _CLIENTS.append(conn)
            try:
                emit_snapshot(state)
            except Exception:
                pass
            threading.Thread(target=submit_connection, args=(conn,), daemon=True).start()

    threading.Thread(target=accept_loop, daemon=True).start()

    def stdin_loop() -> None:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                command = json.loads(line)
            except json.JSONDecodeError:
                emit({"event": "error", "message": "JSON không hợp lệ"})
                continue
            if command.get("cmd") == "shutdown":
                break
            submit(state, command)
        with state.lock:
            stdin_closed = True
        # Plugin đầu tiên đóng stdin: nếu vẫn còn client khác thì tiếp tục sống.
        time.sleep(0.5)
        with _CLIENTS_LOCK:
            others = len(_CLIENTS) > 0
        if not others:
            state.shutdown = True
            state.wake.set()

    stdin_thread = threading.Thread(target=stdin_loop, daemon=True)
    stdin_thread.start()

    emit({"event": "loading"})
    try:
        load_model(state)
    except Exception as error:
        emit({"event": "error", "message": f"nạp model thất bại: {error}"})
        try:
            os.unlink(SOCKET_PATH)
        except OSError:
            pass
        return 1

    stdin_thread.join()
    stop_player(state)
    try:
        server.close()
    except OSError:
        pass
    try:
        os.unlink(SOCKET_PATH)
    except OSError:
        pass
    return 0


def main() -> int:
    if existing_server_alive():
        return run_proxy()
    try:
        os.unlink(SOCKET_PATH)
    except OSError:
        pass
    return run_server()


if __name__ == "__main__":
    raise SystemExit(main())
