#!/usr/bin/env python3
"""
validate_env.py - Production Environment File Validator & Normalizer
Validates and safely normalizes environment files (.env.production).
Ensures secrets with spaces (like Gmail App Passwords) are properly quoted,
verifies syntax, prevents shell injection, and never leaks secret values in output.
"""

import os
import re
import sys
import argparse
from typing import List, Tuple, Dict, Optional

# Critical variables required for production operations
DEFAULT_REQUIRED_KEYS = [
    "DOMAIN_NAME",
    "AUTH_DB_USER",
    "AUTH_DB_PASSWORD",
    "AUTH_DB_NAME",
    "AI_DB_USER",
    "AI_DB_PASSWORD",
    "AI_DB_NAME",
    "BLOG_DB_USER",
    "BLOG_DB_PASSWORD",
    "BLOG_DB_NAME",
    "JWT_SECRET",
]

IDENTIFIER_REGEX = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def parse_and_validate_lines(lines: List[str]) -> Tuple[List[str], List[str], Dict[str, str]]:
    """
    Parses and audits lines from an environment file.
    Returns:
        errors: List of error messages (never exposing secret values).
        warnings: List of warning messages.
        parsed_dict: Dictionary mapping key -> value.
    """
    errors = []
    warnings = []
    parsed_dict = {}

    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line.rstrip("\r\n").strip()

        # Skip empty lines and comment lines
        if not line or line.startswith("#"):
            continue

        # Strip optional leading 'export '
        if line.startswith("export "):
            line = line[7:].strip()

        if "=" not in line:
            errors.append(f"Line {idx}: Syntax error (missing '=' separator).")
            continue

        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()

        if not IDENTIFIER_REGEX.match(key):
            errors.append(f"Line {idx}: Invalid environment variable name '{key}'. Must be a valid identifier.")
            continue

        # Check quote matching
        is_double_quoted = val.startswith('"') and val.endswith('"') and len(val) >= 2
        is_single_quoted = val.startswith("'") and val.endswith("'") and len(val) >= 2

        if val.startswith('"') and not val.endswith('"'):
            errors.append(f"Line {idx}: Variable '{key}' has an unclosed double quote.")
        elif val.startswith("'") and not val.endswith("'"):
            errors.append(f"Line {idx}: Variable '{key}' has an unclosed single quote.")
        elif not is_double_quoted and not is_single_quoted:
            if " " in val or "\t" in val:
                warnings.append(
                    f"Line {idx}: Variable '{key}' contains unquoted spaces. "
                    f"While supported by Docker Compose, enclosing in double quotes is recommended to prevent shell parsing errors."
                )

        parsed_dict[key] = val

    return errors, warnings, parsed_dict


def normalize_content(content: str, overrides: Optional[Dict[str, str]] = None) -> str:
    """
    Normalizes environment file content:
    - Wraps unquoted values containing spaces in double quotes.
    - Applies optional variable overrides securely.
    - Normalizes line endings to UNIX format (\n).
    """
    if overrides is None:
        overrides = {}

    remaining_overrides = dict(overrides)
    new_lines = []

    for raw_line in content.splitlines():
        line = raw_line.rstrip("\r\n")
        stripped = line.strip()

        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue

        prefix = ""
        if stripped.startswith("export "):
            prefix = "export "
            stripped = stripped[7:].strip()

        if "=" in stripped:
            key, val = stripped.split("=", 1)
            key = key.strip()
            val = val.strip()

            if key in remaining_overrides:
                # Apply override
                val = remaining_overrides.pop(key)
                if not ((val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'"))):
                    escaped_val = val.replace("\\", "\\\\").replace('"', '\\"')
                    val = f'"{escaped_val}"'
                new_lines.append(f"{prefix}{key}={val}")
                continue

            # Check if unquoted value contains spaces
            is_quoted = (val.startswith('"') and val.endswith('"') and len(val) >= 2) or \
                        (val.startswith("'") and val.endswith("'") and len(val) >= 2)

            if (" " in val or "\t" in val) and not is_quoted:
                escaped_val = val.replace("\\", "\\\\").replace('"', '\\"')
                val = f'"{escaped_val}"'

            new_lines.append(f"{prefix}{key}={val}")
        else:
            new_lines.append(line)

    # Append any remaining overrides that were not already present
    for o_key, o_val in remaining_overrides.items():
        if not ((o_val.startswith('"') and o_val.endswith('"')) or (o_val.startswith("'") and o_val.endswith("'"))):
            escaped_val = o_val.replace("\\", "\\\\").replace('"', '\\"')
            o_val = f'"{escaped_val}"'
        new_lines.append(f"{o_key}={o_val}")

    return "\n".join(new_lines) + "\n"


def main():
    parser = argparse.ArgumentParser(
        description="Validate and safely normalize environment files (.env.production)."
    )
    parser.add_argument("env_file", nargs="?", default=".env.production", help="Path to environment file")
    parser.add_argument("--fix", action="store_true", help="Automatically quote unquoted values with spaces")
    parser.add_argument("--check-required", action="store_true", help="Verify presence of critical production variables")
    parser.add_argument("--stdin", action="store_true", help="Read input from stdin and write normalized output to stdout")
    parser.add_argument("--set", action="append", default=[], help="Set or override KEY=VALUE (can be specified multiple times)")

    args = parser.parse_args()

    # Parse overrides from --set flags (format: KEY=VALUE)
    overrides = {}
    for item in args.set:
        if "=" in item:
            k, v = item.split("=", 1)
            overrides[k.strip()] = v.strip()

    if args.stdin:
        content = sys.stdin.read()
        normalized = normalize_content(content, overrides)
        lines = normalized.splitlines(keepends=True)
        errors, warnings, parsed_dict = parse_and_validate_lines(lines)

        if errors:
            for err in errors:
                sys.stderr.write(f"ERROR: {err}\n")
            sys.exit(1)

        sys.stdout.write(normalized)
        sys.exit(0)

    filepath = os.path.abspath(args.env_file)
    if not os.path.isfile(filepath):
        sys.stderr.write(f"ERROR: Environment file not found: {filepath}\n")
        sys.exit(1)

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    lines = content.splitlines(keepends=True)
    errors, warnings, parsed_dict = parse_and_validate_lines(lines)

    for w in warnings:
        print(f"[WARN] {w}")

    if errors:
        for e in errors:
            sys.stderr.write(f"[ERROR] {e}\n")
        sys.exit(1)

    if args.check_required:
        missing_keys = [k for k in DEFAULT_REQUIRED_KEYS if k not in parsed_dict or not parsed_dict[k]]
        if missing_keys:
            for k in missing_keys:
                sys.stderr.write(f"[ERROR] Required variable '{k}' is missing or empty in {filepath}.\n")
            sys.exit(1)

    if args.fix or overrides:
        normalized = normalize_content(content, overrides)
        if normalized != content or overrides:
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(normalized)
            # Ensure safe 600 permissions on UNIX
            try:
                os.chmod(filepath, 0o600)
            except OSError:
                pass
            print(f"[SUCCESS] Safely normalized and updated: {filepath} (permissions: 0600)")
        else:
            print(f"[SUCCESS] Environment file already normalized: {filepath}")
    else:
        print(f"[SUCCESS] Environment file validation PASSED: {filepath}")

    sys.exit(0)


if __name__ == "__main__":
    main()
