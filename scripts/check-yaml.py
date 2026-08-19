import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PREFILLABLE = {"input", "textarea"}
FIELD_TYPES = {"markdown", "input", "textarea", "dropdown", "checkboxes"}

problems = []


def check_workflow(path, doc):
    if not isinstance(doc, dict):
        problems.append(f"{path}: not a mapping")
        return
    bare_on_parses_as_true = True
    if "on" not in doc and bare_on_parses_as_true not in doc:
        problems.append(f"{path}: no trigger")
    if "jobs" not in doc or not doc["jobs"]:
        problems.append(f"{path}: no jobs")
        return
    for name, job in doc["jobs"].items():
        if "runs-on" not in job:
            problems.append(f"{path}: job {name} has no runs-on")
        for step in job.get("steps", []):
            if "uses" not in step and "run" not in step:
                problems.append(f"{path}: job {name} has a step with neither uses nor run")


def check_issue_form(path, doc):
    for key in ("name", "description", "body"):
        if key not in doc:
            problems.append(f"{path}: missing {key}")
    if not isinstance(doc.get("labels", []), list):
        problems.append(f"{path}: labels must be a list")
    ids = []
    for field in doc.get("body", []):
        kind = field.get("type")
        if kind not in FIELD_TYPES:
            problems.append(f"{path}: unknown field type {kind!r}")
        if kind == "markdown":
            continue
        if "id" not in field:
            problems.append(f"{path}: {kind} field has no id, so it cannot be prefilled")
            continue
        ids.append(field["id"])
    if "diagnostics" not in ids:
        problems.append(f"{path}: no diagnostics field for the extension to fill")
    else:
        field = next(f for f in doc["body"] if f.get("id") == "diagnostics")
        if field.get("type") not in PREFILLABLE:
            problems.append(
                f"{path}: diagnostics is {field.get('type')!r}; URL prefill only works for input and textarea"
            )


def main():
    files = sorted((ROOT / ".github").rglob("*.yml"))
    if not files:
        print("no yaml found under .github", file=sys.stderr)
        return 1
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        try:
            doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            problems.append(f"{rel}: {exc}")
            continue
        if "/workflows/" in rel:
            check_workflow(rel, doc)
        elif rel.endswith("ISSUE_TEMPLATE/config.yml"):
            if not isinstance(doc.get("blank_issues_enabled"), bool):
                problems.append(f"{rel}: blank_issues_enabled must be true or false")
            for link in doc.get("contact_links", []):
                for key in ("name", "url", "about"):
                    if key not in link:
                        problems.append(f"{rel}: contact link missing {key}")
        elif "/ISSUE_TEMPLATE/" in rel:
            check_issue_form(rel, doc)
        print(f"parsed {rel}")

    if problems:
        print("\nproblems:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1
    print(f"\n{len(files)} files valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
