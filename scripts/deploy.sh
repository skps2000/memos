#!/bin/sh
# 서버에서 GitHub 최신 코드를 받아 프론트/백엔드 빌드 후 배포, 재기동까지 수행하는 배포 스크립트.
# 실패 시(헬스체크 불통) 기존 바이너리로 자동 롤백한다.
# 사용법 (서버에서 root로 실행):
#   bash /usr/local/memos/src/scripts/deploy.sh
# 로컬에서 한 줄로 실행:
#   ssh -i ~/.ssh/mpt_do root@178.128.53.74 "bash /usr/local/memos/src/scripts/deploy.sh"
set -eu

REPO_DIR="/usr/local/memos/src"
INSTALL_DIR="/usr/local/memos"
BIN="${INSTALL_DIR}/memos"
BRANCH="main"
PORT="5230"
HEALTH_RETRIES=10
HEALTH_INTERVAL=2
UNIT_FILE="/etc/systemd/system/memos.service"
UNIT_BACKUP="/etc/systemd/system/memos.service.bak"
DB_FILE="/var/opt/memos/memos_prod.db"
DB_BACKUP_DIR="/var/opt/memos/backups"
DB_BACKUP_KEEP=7

export PATH="/usr/local/go/bin:${PATH}"

echo "==> 1/7 최신 코드 가져오기 (${BRANCH})"
cd "${REPO_DIR}"
git fetch origin "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> 2/7 프론트엔드 빌드 (pnpm release)"
cd "${REPO_DIR}/web"
pnpm install --frozen-lockfile
pnpm release

echo "==> 3/7 백엔드 빌드 (go build)"
cd "${REPO_DIR}"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags "-s -w" -o /tmp/memos.new ./cmd/memos

echo "==> 4/7 기존 바이너리 백업"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${INSTALL_DIR}/memos.bak.v${STAMP}"
cp -f "${BIN}" "${BACKUP}"
echo "백업 완료: ${BACKUP}"

echo "==> 5/7 systemd 유닛 동기화"
if ! cmp -s "${REPO_DIR}/scripts/memos.service" "${UNIT_FILE}"; then
  echo "유닛 파일이 변경됨. ${UNIT_BACKUP} 로 백업 후 교체합니다."
  if [ -f "${UNIT_FILE}" ]; then
    cp -f "${UNIT_FILE}" "${UNIT_BACKUP}"
  fi
  install -m 0644 "${REPO_DIR}/scripts/memos.service" "${UNIT_FILE}"
  systemctl daemon-reload
else
  echo "유닛 파일 변경 없음."
fi

echo "==> 6/7 바이너리 교체 및 재기동"
systemctl stop memos

# 서비스가 멈춘 뒤에 DB를 복사한다. 실행 중 복사는 WAL과 본체가 어긋난
# 스냅샷을 만들 수 있다. 로컬 SQLite 단일 파일 운영이므로 배포마다
# 한 부씩 떠 두고 최근 것만 남긴다. 백업 실패가 배포를 막지는 않는다.
if [ -f "${DB_FILE}" ]; then
  mkdir -p "${DB_BACKUP_DIR}"
  for suffix in "" "-wal" "-shm"; do
    if [ -f "${DB_FILE}${suffix}" ]; then
      cp -f "${DB_FILE}${suffix}" "${DB_BACKUP_DIR}/memos_prod.db${suffix}.${STAMP}" || echo "경고: DB 백업 실패(${suffix})"
    fi
  done
  echo "DB 백업 완료: ${DB_BACKUP_DIR}/memos_prod.db.${STAMP}"
  # 최근 ${DB_BACKUP_KEEP}개만 남기고 정리.
  ls -1t "${DB_BACKUP_DIR}"/memos_prod.db.* 2>/dev/null | tail -n "+$((DB_BACKUP_KEEP + 1))" | while read -r old; do
    rm -f "${old}" "${old%.*}"-wal."${old##*.}" "${old%.*}"-shm."${old##*.}" 2>/dev/null || true
  done
fi

install -m 0755 /tmp/memos.new "${BIN}"
systemctl start memos

echo "==> 7/7 헬스체크"
OK=0
i=0
while [ "${i}" -lt "${HEALTH_RETRIES}" ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    OK=1
    break
  fi
  i=$((i + 1))
  sleep "${HEALTH_INTERVAL}"
done

if [ "${OK}" -eq 1 ]; then
  rm -f /tmp/memos.new
  echo "배포 성공: ${STAMP}"
else
  echo "헬스체크 실패. 롤백합니다..."
  systemctl stop memos
  if [ -f "${UNIT_BACKUP}" ] && ! cmp -s "${UNIT_BACKUP}" "${UNIT_FILE}"; then
    echo "유닛 파일도 롤백합니다."
    install -m 0644 "${UNIT_BACKUP}" "${UNIT_FILE}"
    systemctl daemon-reload
  fi
  install -m 0755 "${BACKUP}" "${BIN}"
  systemctl start memos
  rm -f /tmp/memos.new
  echo "롤백 완료: ${BACKUP}"
  exit 1
fi
