# ARM64 백엔드 배포

`dev`는 개발 브랜치, `main`은 운영 배포 브랜치입니다.

- `dev`/`main` push, 두 브랜치를 대상으로 하는 PR: Java 21 테스트, bootJar 및 ARM64 이미지 빌드.
- `main` push: 성공한 이미지를 GHCR에 커밋 SHA로 게시하고 digest로 coin에 배포.
- 배포 도중 새 main push가 들어와도 실행 중인 운영 배포를 취소하지 않습니다.
- 개발은 `dev`에서 진행하고 PR을 `main`에 merge합니다. main 브랜치 보호에서 CI 성공을 필수로 설정하세요.
- Vercel 프론트 프로젝트의 Production Branch도 `main`으로 유지합니다.

워크플로는 `.github/workflows/backend.yml`, 런타임 이미지는 루트 `Dockerfile`입니다.
GitHub의 `ubuntu-24.04-arm` 러너에서 네이티브 빌드하며 `linux/arm64`를 명시합니다.
운영 서버에서는 빌드하지 않습니다.

## 서버 최초 준비

아래 절차는 coin에서 한 번 수행합니다. 기존 chart-api 컨테이너는 유지합니다.
현재 경로/컨테이너 이름을 기준으로 작성했습니다.

1. `/home/ubuntu/dongne/backend.env`에 `ops/deploy/backend.env.example`을 복사한 뒤
   배포 대상은 기존 `permit_map_dev`이며, 실제 계정/비밀번호를 입력합니다. `chmod 600`을 적용합니다.
   파일은 Docker env-file 형식이며 값에 셸 따옴표를 넣지 않습니다.
   로컬 개발과 운영 앱이 같은 DB를 공유하므로 개발 중 데이터 변경도 운영에 반영됩니다.
2. `/home/ubuntu/dongne/playback`에 서버가 제공할 `national`, `seoul` 재생 파일을 배치합니다.
   기존 `data/playback` 산출물을 복사하거나 export 작업으로 별도 생성합니다.
   컨테이너 UID 10001이 디렉터리와 파일을 읽을 수 있어야 합니다.
   이 경로는 읽기 전용으로 마운트하며 배포 때 데이터를 재생성하지 않습니다.
3. PostgreSQL을 기존 Nginx 네트워크에 연결합니다. DB 포트를 외부 공개하지 않습니다.

   ```bash
   docker network connect --alias permit-map-postgres chart-api_default permit-map-postgres
   ```

   이미 연결됐다면 반복 실행하지 않습니다. PostgreSQL 컨테이너를 재생성하는 관리 설정에도
   `chart-api_default` 외부 네트워크 연결을 반영해야 이후 재생성에도 유지됩니다.
   Spring blue/green도 이 네트워크를 사용합니다.

4. Nginx가 이미 마운트한 디렉터리 안에 새 도메인 설정을 둡니다.

   ```bash
   mkdir -p /home/ubuntu/chart-api/nginx/ssl/dongne/www
   cp ops/deploy/bootstrap-http.conf /home/ubuntu/chart-api/nginx/ssl/dongne/active.conf
   ```

   위 `cp`의 소스는 서버에 복사해 둔 저장소 파일 경로로 바꿉니다.
   `/home/ubuntu/chart-api/nginx/default.conf`를 백업하고 파일 끝의 http 범위에 아래를
   **한 번만** 추가합니다. 기존 server 블록 안에 넣지 않습니다.

   ```nginx
   include /etc/nginx/ssl/dongne/active.conf;
   ```

   이 파일은 개별 bind mount이므로 편집기가 rename으로 파일을 교체하지 않게 주의합니다.
   임시 파일로 검토한 내용을 `cat temporary-file > default.conf`로 덮어쓰면 inode를 유지합니다.
   `docker exec chart-nginx nginx -t` 성공 후 `docker exec chart-nginx nginx -s reload`합니다.
   실패하면 백업 내용을 같은 방식으로 복구합니다.

5. Cloudflare에 `api` A 레코드 → coin의 공인 IP를 추가합니다. 처음에는 DNS only로 둡니다.
   외부에서 80/443 접근이 가능해야 합니다. 기존 chart 도메인 레코드는 유지합니다.
6. 인증서를 webroot 방식으로 발급합니다. 실제 이메일을 입력합니다.

   ```bash
   docker run --rm \
     -v /home/ubuntu/chart-api/nginx/ssl/dongne/www:/var/www/acme \
     -v /home/ubuntu/chart-api/nginx/ssl/dongne/letsencrypt:/etc/letsencrypt \
     certbot/certbot certonly --webroot -w /var/www/acme \
     -d api.dongne.town --email YOUR_EMAIL --agree-tos --non-interactive
   ```

   인증서와 키는 저장소나 CI 로그에 넣지 않습니다. 발급 후 `bootstrap-https.conf`를
   `active.conf`에 복사하고 Nginx 설정 검사/reload를 수행하면 첫 배포 전까지 HTTPS 503을 응답합니다.
   인증서 갱신은 `ops/deploy/renew-certificate.sh`를 `/home/ubuntu/dongne`에 복사한 뒤
   서버 cron에 등록합니다. 배포와 같은 lock을 사용하며 동시 실행을 피합니다.

   ```bash
   17 3,15 * * * /bin/bash /home/ubuntu/dongne/renew-certificate.sh >> /home/ubuntu/dongne/certificate-renewal.log 2>&1
   ```

## GitHub 설정

저장소 Settings → Environments에서 `production` 환경을 만들고 배포 브랜치를 `main`으로 제한합니다.
자동 배포를 원하면 별도 수동 승인 규칙은 추가하지 않습니다.
해당 환경 Secrets에 아래 값을 등록합니다. 비밀키는 채팅이나 저장소에 붙이지 않습니다.

| Secret | 값 |
| --- | --- |
| `COIN_HOST` | `158.180.67.78` |
| `COIN_USER` | `ubuntu` |
| `COIN_SSH_KEY` | coin의 ubuntu authorized_keys에 공개키를 등록한 배포 전용 SSH 개인키 |
| `COIN_KNOWN_HOSTS` | 신뢰할 수 있는 기존 연결과 지문을 대조한 서버 known_hosts 항목 |

서버 계정은 Docker를 실행할 수 있어야 합니다. 서버 22 포트의 방화벽 정책에서도 GitHub 러너 접속이
가능해야 합니다. 개인 PC에서 SSH에 성공했다는 사실만으로 러너의 접근까지 보장되지는 않습니다.

GHCR 게시/다운로드는 워크플로의 `GITHUB_TOKEN`을 사용하므로 별도 PAT를 GitHub에 넣지 않습니다.
기존 GHCR 패키지를 재사용한다면 이 저장소 Actions에 패키지 read/write 권한을 부여합니다.
서버 로그인 정보는 임시 Docker config에만 저장하고 배포 완료/실패 시 삭제합니다.

## 전환과 실패 처리

- 컨테이너 이름은 `dongne-blue`, `dongne-green`입니다. 호스트에 8080을 공개하지 않습니다.
- 앱마다 메모리 1GiB, 힙 최대 512MiB, CPU 최대 1개를 배정합니다.
- readiness에는 DB 연결을 포함하며 최대 180초 대기합니다. 실패하면 새 컨테이너를 제거하고 기존 설정을 유지합니다.
- Nginx 설정 검사 후 graceful reload하고, 실제 HTTPS 경로의 categories 응답을 확인합니다.
- 검사 실패 시 이전 Nginx 설정을 복원합니다. 이미 전환했다면 요청 처리를 위해 컨테이너를 남깁니다.
- 이전 Nginx worker가 모두 종료된 뒤 기존 Spring을 graceful shutdown합니다.
  120초 넘게 연결이 남으면 기존 컨테이너를 보존하고 안내합니다. 다음 배포 전 상태를 확인해 정리합니다.
- state는 `/home/ubuntu/dongne/active-color`에 저장합니다. 컨테이너를 수동 삭제하기 전에 이 값을 확인합니다.
- 처음 배포 전 `active-color` 파일은 만들지 않습니다.
- 재생 파일의 존재 여부/정합성과 전체 지도 동작은 health 검사만으로 검증되지 않습니다.

Spring 시작 시 Flyway migration이 실행됩니다. 배포 전에 DB 백업과 migration을 검토하고,
구버전과 신버전이 동시에 읽을 수 있는 추가형 변경을 적용합니다. 이미지/Nginx 롤백은 DB를 되돌리지 않습니다.
blue/green은 단일 인스턴스의 재시작·장애까지 막지는 않습니다.

실패 로그는 서버에서 `docker logs dongne-blue` 또는 `docker logs dongne-green`으로 확인합니다.
준비 중 실패한 후보 컨테이너는 삭제되므로 필요 시 해당 digest를 격리된 이름으로 재실행해 진단합니다.
건강한 이미지 digest를 다시 `bash ops/deploy/deploy.sh ghcr.io/...@sha256:...`에 전달하면
이전 버전으로도 같은 절차로 배포할 수 있습니다. 비공개 패키지는 먼저 서버에서 안전하게 로그인해야 합니다.

## 프론트 연결

현재 프론트는 상대 경로 `/api/...`를 사용합니다. 백엔드 배포 후 Vercel에서
`/api/:path*` → `https://api.dongne.town/api/:path*` 외부 rewrite를 추가하면
브라우저 코드를 유지하면서 같은 출처로 요청할 수 있습니다. rewrite는 API 인증 수단이 아닙니다.
직접 API 도메인을 호출하는 방식으로 바꾸려면 Spring CORS도 함께 구성합니다.
이 연결은 백엔드 배포 준비와 별도이며 아직 적용하지 않았습니다.
