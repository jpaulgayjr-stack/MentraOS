#!/usr/bin/env python3
"""List the hostnames in a sinkhole log, with how often each was tried.

    python3 sinkhole-hosts.py sinkhole.jsonl
"""
import collections
import json
import sys


def main():
    counts = collections.Counter()
    with open(sys.argv[1], encoding="utf-8") as log:
        for line in log:
            if line.strip():
                entry = json.loads(line)
                counts[f'{entry.get("host") or "unknown host"}:{entry.get("port")}'] += 1
    print(", ".join(f"{host} ({count})" for host, count in counts.most_common()))


if __name__ == "__main__":
    main()
