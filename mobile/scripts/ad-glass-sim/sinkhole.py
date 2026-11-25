#!/usr/bin/env python3
"""AD Glass: a sinkhole for the hostnames the app must never contact.

The simulator job points every hostname in ../ad-glass-blocked-hosts.txt at
127.0.0.1 and ::1 and runs this on ports 80 and 443. Each connection is accepted, read
once, logged as one JSON line (with the hostname the client asked for: the TLS
server name, or the HTTP Host header) and closed. Nothing is ever answered.

    sudo python3 sinkhole.py --log /tmp/sinkhole.jsonl [--port 80 --port 443]

See docs/ad-glass/spec-phase2.md.
"""
import argparse
import json
import socket
import threading
import time


def tls_server_name(data: bytes):
    """The server name of a TLS ClientHello, or None."""
    try:
        if len(data) < 43 or data[0] != 0x16 or data[5] != 0x01:
            return None
        pos = 43  # record header (5) + handshake header (4) + version (2) + random (32)
        pos += 1 + data[pos]  # session id
        pos += 2 + int.from_bytes(data[pos:pos + 2], "big")  # cipher suites
        pos += 1 + data[pos]  # compression methods
        end = pos + 2 + int.from_bytes(data[pos:pos + 2], "big")
        pos += 2
        while pos + 4 <= min(end, len(data)):
            kind = int.from_bytes(data[pos:pos + 2], "big")
            size = int.from_bytes(data[pos + 2:pos + 4], "big")
            pos += 4
            if kind == 0:  # server_name: list length (2), name type (1), name length (2), name
                length = int.from_bytes(data[pos + 3:pos + 5], "big")
                return data[pos + 5:pos + 5 + length].decode("ascii", "replace")
            pos += size
    except (IndexError, ValueError):
        return None
    return None


def http_host(data: bytes):
    """The Host header of a plain HTTP request, or None."""
    try:
        head = data.split(b"\r\n\r\n", 1)[0].decode("latin-1")
    except Exception:
        return None
    for line in head.split("\r\n")[1:]:
        name, _, value = line.partition(":")
        if name.strip().lower() == "host":
            return value.strip()
    return None


def describe(port: int, data: bytes):
    host = tls_server_name(data) or http_host(data)
    first_line = None
    if data and data[0] != 0x16:
        first_line = data.split(b"\r\n", 1)[0][:200].decode("latin-1", "replace")
    return {"host": host, "bytes": len(data), "request": first_line}


def serve(port: int, log_path: str, lock: threading.Lock, address: str = "127.0.0.1"):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    server = socket.socket(family, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((address, port))
    server.listen(64)
    while True:
        connection, peer = server.accept()
        threading.Thread(target=handle, args=(connection, peer, port, log_path, lock), daemon=True).start()


def handle(connection, peer, port, log_path, lock):
    data = b""
    try:
        connection.settimeout(3)
        data = connection.recv(8192)
    except OSError:
        pass
    finally:
        try:
            connection.close()
        except OSError:
            pass
    entry = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "port": port, "peer": peer[0], **describe(port, data)}
    with lock:
        with open(log_path, "a", encoding="utf-8") as log:
            log.write(json.dumps(entry) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--log", required=True)
    parser.add_argument("--port", type=int, action="append")
    args = parser.parse_args()
    ports = args.port or [80, 443]
    open(args.log, "a", encoding="utf-8").close()
    lock = threading.Lock()
    for port in ports:
        for address in ("127.0.0.1", "::1"):
            threading.Thread(target=serve, args=(port, args.log, lock, address), daemon=True).start()
    print(f"sinkhole listening on 127.0.0.1 and ::1, ports {ports}, logging to {args.log}", flush=True)
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
