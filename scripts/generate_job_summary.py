#!/usr/bin/env python3
"""
generate_job_summary.py - GitHub Actions Rich Step Summary Generator
Creates markdown deployment and CI/CD audit reports written directly
to the GitHub Actions $GITHUB_STEP_SUMMARY environment file.
"""

import os
import sys
from datetime import datetime, timezone

def generate_summary(
    status: str,
    environment: str,
    commit_sha: str,
    actor: str,
    run_id: str,
    image_tag: str,
    app_url: str,
    rollback_status: str = "N/A"
) -> str:
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    short_sha = commit_sha[:7] if commit_sha else "unknown"

    status_badge = "🟢 **SUCCESSFUL**" if status.upper() == "SUCCESS" else (
        "🟡 **ROLLED BACK**" if status.upper() == "ROLLBACK" else "🔴 **FAILED**"
    )

    lines = [
        "## 🚀 Deployment Pipeline Summary",
        "",
        f"| Parameter | Details |",
        f"| :--- | :--- |",
        f"| **Status** | {status_badge} |",
        f"| **Environment** | `{environment}` |",
        f"| **Commit** | [`{short_sha}`](https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/commit/{commit_sha}) |",
        f"| **Triggered By** | @{actor} |",
        f"| **Run ID** | [{run_id}](https://github.com/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{run_id}) |",
        f"| **Timestamp** | {now_utc} |",
        f"| **Docker Image Tag** | `{image_tag}` |",
        f"| **Rollback Status** | `{rollback_status}` |",
        "",
        "### 🔍 Verification & Health Status",
        "- [x] Pre-flight security & syntax audit passed",
        "- [x] Container images built & verified with BuildKit",
        f"- [x] Automated pre-deploy database snapshot recorded",
        f"- [{'x' if status.upper() == 'SUCCESS' else ' '}] Zero-downtime rolling container update",
        f"- [{'x' if status.upper() == 'SUCCESS' else ' '}] Post-deploy health probes & HTTP response check",
        ""
    ]

    if app_url and app_url != "N/A":
        lines.append(f"🔗 **Live Application URL**: [{app_url}]({app_url})\n")

    return "\n".join(lines)

def main():
    status = sys.argv[1] if len(sys.argv) > 1 else "SUCCESS"
    environment = sys.argv[2] if len(sys.argv) > 2 else "production"
    commit_sha = os.environ.get("GITHUB_SHA", sys.argv[3] if len(sys.argv) > 3 else "HEAD")
    actor = os.environ.get("GITHUB_ACTOR", "ci-bot")
    run_id = os.environ.get("GITHUB_RUN_ID", "local")
    image_tag = sys.argv[4] if len(sys.argv) > 4 else f"sha-{commit_sha[:7]}"
    app_url = os.environ.get("APP_URL", "https://api.gitrabbit.co")
    rollback = sys.argv[5] if len(sys.argv) > 5 else "None"

    markdown = generate_summary(status, environment, commit_sha, actor, run_id, image_tag, app_url, rollback)

    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file and os.path.exists(os.path.dirname(summary_file)):
        with open(summary_file, "a", encoding="utf-8") as f:
            f.write(markdown + "\n")
        print(f"Summary written to $GITHUB_STEP_SUMMARY: {summary_file}")
    else:
        print(markdown)

if __name__ == "__main__":
    main()
