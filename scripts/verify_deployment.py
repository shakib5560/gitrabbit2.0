#!/usr/bin/env python3
"""
verify_deployment.py - Post-Deployment Health, Security & Connectivity Verifier
Audits running container states, public port isolation, HTTP/HTTPS endpoints,
and security headers for GitRabbit Microservices.
"""

import sys
import json
import subprocess
import urllib.request
import urllib.error
import ssl
from typing import List, Dict, Any

GREEN = "\033[0;32m"
RED = "\033[0;31m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
NC = "\033[0m"

def print_result(status: str, title: str, details: str = ""):
    badge = f"{GREEN}[PASS]{NC}" if status == "PASS" else (f"{YELLOW}[WARN]{NC}" if status == "WARN" else f"{RED}[FAIL]{NC}")
    print(f" {badge} {title}")
    if details:
        for line in details.strip().splitlines():
            print(f"        {line}")

def run_cmd(cmd: List[str]) -> str:
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return res.stdout.strip()
    except subprocess.CalledProcessError as e:
        return ""

def check_containers(compose_file: str) -> bool:
    print(f"\n{BLUE}=== 1. Checking Container Health & Running States ==={NC}")
    out = run_cmd(["docker", "compose", "-f", compose_file, "ps", "--format", "json"])
    if not out:
        print_result("FAIL", "No running containers found or Docker daemon unreachable.")
        return False

    lines = out.strip().splitlines()
    all_ok = True
    for line in lines:
        try:
            c = json.loads(line)
            name = c.get("Name") or c.get("Service", "unknown")
            state = c.get("State", "").lower()
            health = c.get("Health", "").lower()

            if state == "running":
                if health in ["", "healthy"]:
                    print_result("PASS", f"Container '{name}': State={state}, Health={health or 'active'}")
                else:
                    print_result("FAIL", f"Container '{name}': Unhealthy status ({health})")
                    all_ok = False
            else:
                print_result("FAIL", f"Container '{name}': State is {state}")
                all_ok = False
        except Exception:
            pass
    return all_ok

def check_exposed_ports(compose_file: str) -> bool:
    print(f"\n{BLUE}=== 2. Auditing Public Port Exposure & Network Isolation ==={NC}")
    out = run_cmd(["docker", "compose", "-f", compose_file, "ps", "--format", "json"])
    lines = out.strip().splitlines()

    flagged_ports = {5432: "PostgreSQL", 6379: "Redis"}
    secure = True

    for line in lines:
        try:
            c = json.loads(line)
            name = c.get("Name", "unknown")
            publishers = c.get("Publishers", []) or []
            for pub in publishers:
                host_ip = pub.get("URL", "")
                host_port = pub.get("PublishedPort", 0)
                target_port = pub.get("TargetPort", 0)

                if host_ip in ["0.0.0.0", "::", ""] and target_port in flagged_ports:
                    print_result("FAIL", f"SECURITY RISK: {flagged_ports[target_port]} port {target_port} is bound to host ({host_ip}:{host_port}) in '{name}'!")
                    secure = False

                if target_port not in [80, 443] and host_ip in ["0.0.0.0", "::"]:
                    print_result("WARN", f"Host port {host_port} exposed on container '{name}'. All traffic should route via Gateway ports 80/443.")
        except Exception:
            pass

    if secure:
        print_result("PASS", "All databases and Redis instances are isolated without public host port bindings.")
    return secure

def probe_endpoint(url: str) -> bool:
    print(f"\n{BLUE}=== 3. Probing Health Endpoint: {url} ==={NC}")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "GitRabbit-Deployment-Verifier/1.0"}
    )

    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            status_code = resp.getcode()
            headers = dict(resp.info())
            body = resp.read().decode("utf-8", errors="replace")[:300]

            if status_code in [200, 204]:
                print_result("PASS", f"Endpoint returned HTTP {status_code} OK")
            else:
                print_result("WARN", f"Endpoint returned HTTP {status_code}")

            # Check Security Headers
            sec_headers = {
                "strict-transport-security": "HSTS (Strict-Transport-Security)",
                "x-content-type-options": "MIME Sniffing (X-Content-Type-Options)",
                "x-frame-options": "Clickjacking (X-Frame-Options)",
                "referrer-policy": "Referrer Policy (Referrer-Policy)"
            }

            headers_lower = {k.lower(): v for k, v in headers.items()}
            for h_key, h_desc in sec_headers.items():
                if h_key in headers_lower:
                    print_result("PASS", f"Header '{h_desc}': {headers_lower[h_key]}")
                else:
                    print_result("WARN", f"Recommended Header '{h_desc}' not found.")

            return status_code in [200, 204]

    except urllib.error.HTTPError as e:
        print_result("FAIL", f"HTTP Error {e.code}: {e.reason}")
        return False
    except urllib.error.URLError as e:
        print_result("FAIL", f"Connection failed: {e.reason}")
        return False
    except Exception as e:
        print_result("FAIL", f"Unexpected error during probe: {str(e)}")
        return False

def main():
    compose_file = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith((".yml", ".yaml")) else "docker-compose.prod.yml"
    url = sys.argv[2] if len(sys.argv) > 2 else (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://localhost/healthz")

    print(f"Target Compose File: {compose_file}")
    print(f"Target Verification URL: {url}")

    c_ok = check_containers(compose_file)
    p_ok = check_exposed_ports(compose_file)
    e_ok = probe_endpoint(url) if url else True

    print("\n==========================================================")
    if c_ok and p_ok and e_ok:
        print(f"{GREEN}🎉 DEPLOYMENT VERIFICATION PASSED ALL CHECKS!{NC}")
        sys.exit(0)
    else:
        print(f"{RED}❌ DEPLOYMENT VERIFICATION FAILED ONE OR MORE AUDITS.{NC}")
        sys.exit(1)

if __name__ == "__main__":
    main()
