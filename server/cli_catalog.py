"""Read-only discovery of CLI customization names, never account secrets."""

from pathlib import Path


def catalog_roots(kind, cwd=None):
    gemini = Path.home() / ".gemini"
    profile = gemini / "antigravity-cli"
    roots = [
        profile / kind,
        profile / "builtin" / kind,
        gemini / kind,
        gemini / "config" / kind,
    ]
    owned = list(roots)
    if cwd is not None:
        workspace = Path(cwd).expanduser().resolve()
        roots[0:0] = [
            workspace / ".agents" / kind,
            workspace / ".agent" / kind,
        ]
        owned[0:0] = roots[:2]
    for plugins in (profile / "plugins", gemini / "config" / "plugins"):
        if plugins.is_symlink() or not plugins.is_dir():
            continue
        roots.extend(
            path / kind
            for path in plugins.iterdir()
            if path.is_dir() and not path.is_symlink()
        )
    return [
        (root, root in owned and "builtin" not in root.parts) for root in roots
    ]


def skill_files(cwd=None):
    for root, mutable in catalog_roots("skills", cwd):
        linked = any(
            path.is_symlink() or (
                hasattr(path, "is_junction") and path.is_junction()
            ) for path in (root, *root.parents)
        )
        if linked or not root.is_dir():
            continue
        for folder in root.iterdir():
            if folder.is_symlink() or not folder.is_dir():
                continue
            for filename in ("SKILL.md", "SKILL.md.disabled"):
                path = folder / filename
                if (
                    path.is_file()
                    and not path.is_symlink()
                    and path.resolve().is_relative_to(root.resolve())
                ):
                    yield folder.name, path, mutable


def toggle_skill(name, action, cwd=None):
    if (
        not isinstance(name, str)
        or name in (".", "..")
        or not name
        or any(character in name for character in "/\\")
        or any(ord(character) < 32 for character in name)
        or action not in ("enable", "disable")
    ):
        raise ValueError("Invalid skill action")
    matches = [item for item in skill_files(cwd) if item[0] == name]
    if not matches:
        raise FileNotFoundError("Skill not found")
    if len(matches) != 1:
        raise ValueError("Skill name is ambiguous; select a unique skill")
    _, source, mutable = matches[0]
    if not mutable:
        raise PermissionError("Plugin and built-in skills are read-only")
    filename = "SKILL.md" if action == "enable" else "SKILL.md.disabled"
    target = source.with_name(filename)
    if target == source:
        return
    if target.exists() or target.is_symlink():
        raise ValueError("Skill target already exists")
    source.rename(target)


def local_catalog(kind, cwd=None):
    entries = {}
    if kind == "skills":
        files = list(skill_files(cwd))
        counts = {}
        for name, _, _ in files:
            counts[name] = counts.get(name, 0) + 1
        for name, path, mutable in files:
            if name and not any(ord(char) < 32 for char in name):
                entries.setdefault(
                    name,
                    {
                        "id": name,
                        "name": name,
                        "enabled": path.name == "SKILL.md",
                        "mutable": mutable and counts[name] == 1,
                    },
                )
        return list(entries.values())
    pattern = "SKILL.md" if kind == "skills" else "*.toml"
    for root, _ in catalog_roots(kind, cwd):
        if root.is_symlink() or not root.is_dir():
            continue
        for path in root.rglob(pattern):
            if (
                not path.is_file()
                or path.is_symlink()
                or not path.resolve().is_relative_to(root.resolve())
            ):
                continue
            name = path.parent.name if kind == "skills" else path.stem
            if not name or any(ord(char) < 32 for char in name):
                continue
            identifier = name if kind == "skills" else "/" + name
            entries[identifier] = {"id": identifier, "name": name}
    if kind == "commands":
        entries.setdefault("/help", {"id": "/help", "name": "CLI help"})
    return list(entries.values())
