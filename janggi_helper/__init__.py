"""한국 장기 수 추천 앱 패키지."""

from __future__ import annotations

from pathlib import Path
import site
import sys


def _ensure_local_deps_on_path() -> None:
    """프로젝트 내부 의존성 폴더를 우선 로드한다."""
    project_root = Path(__file__).resolve().parent.parent
    deps_dir = project_root / ".deps"
    if deps_dir.exists():
        deps_path = str(deps_dir)
        if deps_path not in sys.path:
            sys.path.insert(0, deps_path)


def _ensure_user_site_on_path() -> None:
    """일부 Windows 환경에서 사용자 사이트 경로가 누락되는 문제를 보정한다."""
    try:
        user_site = site.getusersitepackages()
    except Exception:
        return
    if user_site and user_site not in sys.path:
        sys.path.append(user_site)


_ensure_local_deps_on_path()
_ensure_user_site_on_path()
