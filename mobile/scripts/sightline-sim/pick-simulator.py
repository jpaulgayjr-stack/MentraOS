#!/usr/bin/env python3
"""Pick an iPhone simulator from `xcrun simctl list devices available -j`.

    python3 pick-simulator.py devices.json

Prints the device's UDID on stdout and its name and iOS version on stderr.
Takes the newest iOS runtime that has an iPhone, and prefers a plain iPhone
over a Pro or Pro Max (smaller screenshots, same app).
"""
import json
import re
import sys


def runtime_version(runtime: str):
    match = re.search(r"iOS-(\d+)-(\d+)", runtime)
    return (int(match.group(1)), int(match.group(2))) if match else None


def pick(devices: dict):
    runtimes = sorted(
        (runtime for runtime in devices if runtime_version(runtime)), key=runtime_version, reverse=True
    )
    for runtime in runtimes:
        phones = [
            device
            for device in devices[runtime]
            if device.get("isAvailable", True) and device.get("name", "").startswith("iPhone")
        ]
        if not phones:
            continue
        phones.sort(key=lambda device: ("Pro" in device["name"], device["name"]))
        major, minor = runtime_version(runtime)
        return phones[0]["udid"], f'{phones[0]["name"]}, iOS {major}.{minor}'
    return None


def main():
    with open(sys.argv[1], encoding="utf-8") as handle:
        chosen = pick(json.load(handle)["devices"])
    if not chosen:
        sys.exit("no available iPhone simulator")
    print(chosen[0])
    sys.stderr.write(chosen[1] + "\n")


if __name__ == "__main__":
    main()
