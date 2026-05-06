#!/usr/bin/env python3
"""
Point d'entrée PDF : lit le JSON depuis stdin, agrège si nécessaire, écrit le PDF sur stdout.
"""

import sys
import json
import os
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import aggregate_prestations
import generate_devis_module


def main():
    payload = json.loads(sys.stdin.read())

    for k in ('date_emission', 'date_validite'):
        val = payload.get(k)
        if isinstance(val, str) and val:
            try:
                payload[k] = date.fromisoformat(val)
            except Exception:
                pass

    if payload.get('prestations_detaillees'):
        payload['missions'] = aggregate_prestations.aggregate(
            payload['prestations_detaillees']
        )

    sys.stdout.buffer.write(generate_devis_module.generate_devis_pdf(payload))


if __name__ == '__main__':
    main()
