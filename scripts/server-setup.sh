#!/bin/sh
# Marklog 프로덕션 서버에서 직접 빌드하고 싶을 때 쓰는 1회 초기 설정 스크립트.
# 스왑 + Go 툴체인 + Node/pnpm 설치 후 저장소를 클론한다.
#
# 평소 배포에는 필요 없다. deploy.sh는 개발 머신에서 빌드한 바이너리를 올리므로
# 서버에는 툴체인도 체크아웃도 없어도 된다. 8.7GB 디스크에 Go 캐시와 node_modules까지
# 얹으면 금방 가득 차므로, 서버 빌드가 꼭 필요한 경우가 아니면 실행하지 말 것.
#
# 사용법 (서버에서 root로 실행):
#   curl -fsSL https://raw.githubusercontent.com/skps2000/memos/main/scripts/server-setup.sh -o /tmp/server-setup.sh
#   bash /tmp/server-setup.sh
set -eu

GO_VERSION="1.26.2"
PNPM_VERSION="11.0.1"
REPO_URL="https://github.com/skps2000/memos.git"
REPO_DIR="/usr/local/memos/src"

command -v curl >/dev/null 2>&1 || apt-get install -y curl

echo "==> 1/4 스왑 2G 추가 (512MB 드롭릿 빌드용 메모리 확보)"
if ! swapon --show | grep -q "swapfile"; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  sysctl -w vm.swappiness=10 || true
fi

echo "==> 2/4 Go ${GO_VERSION} 설치"
if [ ! -x /usr/local/go/bin/go ]; then
  curl -fL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tgz
  rm -f /tmp/go.tgz
fi
/usr/local/go/bin/go version

echo "==> 3/4 Node 24 + pnpm 설치"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/node-setup.sh
  bash /tmp/node-setup.sh
  apt-get install -y nodejs
  rm -f /tmp/node-setup.sh
fi
node --version
if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate
else
  npm install -g "pnpm@${PNPM_VERSION}"
fi

echo "==> 4/4 저장소 클론"
command -v git >/dev/null 2>&1 || apt-get install -y git
if [ ! -d "${REPO_DIR}/.git" ]; then
  git clone "${REPO_URL}" "${REPO_DIR}"
else
  echo "이미 클론되어 있음: ${REPO_DIR}"
fi

echo
echo "설정 완료. 서버에서 빌드하려면 ${REPO_DIR} 에서 직접 pnpm release / go build 를 실행하세요."
echo "평소 배포는 개발 머신에서: sh scripts/deploy.sh"
