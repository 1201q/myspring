# 전국 인허가 공통 수집기

Python 3.11 이상 표준 라이브러리로 실행하는 원천 수집·품질 검사 도구다.
공식 [업종 카탈로그](national-category-catalog.md)를 읽어서 업종명/서비스 ID로 선택한다.
이 단계는 원본 CSV 확보와 검증이며 Spring DB 적재는 다음 단계다.

## 실행

상권 분석 1차 대상 15종은 [수집 범위](commercial-area-collection-scope.md)에 정의했다.
`python scripts/collect-national-permits.py --profile commercial-area-v1 --dry-run`으로 범위를 확인하고,
`--download`로 원본 확보·검사를 실행한다. 프로필 정의는 `config/collection-profiles.json`이다.

프로젝트 루트 `C:\projects\spring`에서 실행한다.

```powershell
# 전체 인허가 업종 목록 (사업장 데이터 다운로드 없음)
python scripts/collect-national-permits.py --list

# 생활 분류의 업종 목록
python scripts/collect-national-permits.py --list --group 생활

# 업종명으로 선택하고 계획만 확인
python scripts/collect-national-permits.py --category 약국 --dry-run

# 새 원본이 없을 때 다운로드하고 검사
python scripts/collect-national-permits.py --category 약국 --download

# 여러 업종 선택 (지정한 업종들을 카탈로그 순서대로 처리)
python scripts/collect-national-permits.py --slug pharmacies --slug lumber_import_distribution --download

# 받은 원본만 다시 검사 (네트워크 다운로드 없음)
python scripts/collect-national-permits.py --slug pharmacies
```

`--category`는 정확한 한글 업종명, `--slug`는 카탈로그의 공식 서비스 ID다. 둘 다 여러 번 지정할 수 있으며 중복 선택은 한 번만 처리한다.
`--group`은 선택 결과를 추가로 필터링한다. 대량 파일이 자동으로 수집되지 않도록 실제 실행에는 업종명/ID를 명시해야 한다.
비인허가 서비스인 CCTV 등은 선택을 거절한다. `--dry-run`은 `--download`를 함께 줘도 파일/실행 기록/네트워크를 생성하지 않는다.

## 파일 위치

- 원본: `data/national-audit/{slug}.csv` (기존 3종도 재사용)
- 다운로드 출처·바이트 크기·SHA-256: 같은 폴더의 `{slug}.download.json`
- 기본 검사 결과: `data/national-collection/reports/{run_id}/{slug}.quality.json`
- 서비스에 필요한 필드만 추린 최대 20건 샘플: 위 폴더의 `{slug}.sample.json`
- 실행 기록: `data/national-collection/runs/{run_id}.json`

실행 기록에는 선택 목록, 업종별 처리 결과, 파일 재사용/다운로드 여부, 건수, 해시, 품질 결과와 실패 사유를 기록한다.
실행 완료 `COMPLETED`와 데이터 품질 `CHECKS_PASSED`/`REVIEW_REQUIRED`는 다르다. 오류 날짜나 좌표 누락이 있어도 원본 검사 자체는 완료할 수 있다.
실패하면 비정상 종료 코드와 `FAILED`, 중단하면 `INTERRUPTED`가 기록된다. 파일/네트워크 오류 이후 다음 업종으로 계속 진행하지 않는다.

이 폴더들은 Git에서 제외된다. 리뷰용 검사 결과를 남기려면 다음처럼 경로를 지정한다.

```powershell
python scripts/collect-national-permits.py --slug pharmacies --output-dir docs/data-samples/national
```

보고서에는 기관코드·상태·연도별 집계와 검증에 필요한 최소 샘플만 남긴다. 전화번호·대표자명·자본금 등은 샘플에서 제외한다.
원본 CSV 자체는 공공 파일을 그대로 보관하므로 서비스와 무관한 제공 필드도 포함될 수 있다. 원본을 Git에 추가하지 않는다.

## 무결성과 재실행

- 공식 파일 경로 패턴과 카탈로그가 일치하는지 확인한다. 등록된 인허가 업종만 선택할 수 있다.
- 공식 화면의 다운로드 제한 확인을 거친다. 인증키는 사용하지 않으며 거절/제한 응답을 우회하지 않는다.
- 바이트 원문을 보관하고 `Content-Length`와 실제 크기를 대조한다. 한 파일은 최대 1 GiB다.
- 중간 파일은 `.csv.part`이며 성공 전에는 `.csv`로 공개하지 않는다. HTML/JSON 오류 응답을 CSV로 취급하지 않는다.
- 새 다운로드에는 SHA-256을 남기고 재검사 시 비교한다. 해시 기록이 없던 초기 3종은 카탈로그의 기존 검증 해시와 대조한다.
- 다운로드 출처가 없거나 다른 업종 URL인 캐시 파일은 공통 수집기가 거절한다. 임의 파일의 오인 적재를 방지한다.
- JSON 출처/보고서/실행 기록은 임시 파일 작성 후 교체한다.
- 완료된 CSV는 덮어쓰지 않는다. 재실행은 기존 파일을 다시 검사하며 중복 다운로드하지 않는다.
- 실패한 파일의 바이트 위치부터 이어받지는 않는다. `.part`를 처음부터 다시 받고, 앞서 완료된 업종은 재사용한다.
- 같은 원본 디렉터리에 수집 프로세스를 동시에 여러 개 실행하는 방식은 지원하지 않는다.

다른 날짜의 스냅샷은 별도 원본 디렉터리에 받는다. 한 디렉터리에서 `--download`만 반복해도 최신 파일로 갱신되는 것은 아니다.

```powershell
python scripts/collect-national-permits.py --category 약국 --download --data-dir data/snapshots/2026-11-05
```

## 품질 검사 범위

- 카탈로그가 선언한 공통 필드를 CSV 한글 헤더와 대응해 검사한다. 메타데이터 계약과 다른 필수 헤더는 실패 처리한다.
- 기관코드+관리번호 기준 중복과 관리번호 단독 중복을 구분한다.
- 날짜는 `yyyyMMdd`와 `yyyy-MM-dd`를 엄격하게 파싱한다. 존재하지 않는 날짜, 미래 날짜, 폐업일이 인허가일보다 빠른 경우를 표시한다.
- 폐업일이 제공되지 않는 업종은 `date_field_support.closed=false`다. 전체 행을 날짜 누락으로 세거나 수집일로 폐업 사건을 만들지 않는다.
- 폐업일 필드는 있는데 값이 없는 건은 별도 누락 건수로 기록한다. 현재 폐업 상태인데 유효 폐업일이 없는 건도 별도로 센다.
- 좌표 쌍의 누락·부분 누락·숫자 오류·0/0을 검사한다. 이 검사만으로 좌표계/실제 위치가 정확하다고 판단하지 않는다.
- 날짜별 사건을 DB에 저장하거나 전국 지리 좌표를 자동 변환하지 않는다. 원천 상태의 의미와 업종별 분석 적합성은 다음 적재 단계에서 적용한다.

카탈로그 195종을 선택할 수 있지만 모든 업종의 CSV 실물 계약까지 검증한 것은 아니다. 미검증 업종은 공식 파일이 없거나 헤더가 다르면 실패 기록을 남기고 개별 어댑터를 보완한다.

## 실제 확인 결과 (2026-11-04)

| 새로 확인한 업종 | 전국 CSV 행 | 좌표 누락 | 폐업일 지원 | 결과 |
| --- | ---: | ---: | --- | --- |
| 약국 | 70,770 | 17,122 | 있음 | 공식 공개 조회 총건수와 일치 |
| 목재수입유통업 | 3,444 | 539 | 없음 | 공식 공개 조회 총건수와 일치; 폐업 사건 미생성 대상 |

약국에는 현재 폐업 상태지만 유효 폐업일이 없는 건이 5,875건 있다. 과거 사건 지도에는 발생일 미상으로 처리해야 한다.
실행 후 원본을 재사용하는 두 번째 수집을 수행했고 파일 액션이 `REUSED`로 기록됐다.
미용업 기존 원본도 새 수집기로 재검사해 출처 및 해시 호환성을 확인했다.

- [약국 검사](data-samples/national/pharmacies.quality.json)
- [목재수입유통업 검사](data-samples/national/lumber_import_distribution.quality.json)
- [공식 총건수 대조 기록](data-samples/national/collector-verification.json)

기존 3종을 포함해 전체 파일 검증 기록은 현재 5종이다. 별도의 Java 적재기로 약국·목재수입유통업 74,214건을 [서버 PostgreSQL에 반영](national-postgres-import.md)했다. 지도/API는 여전히 기존 50건 샘플을 사용한다. Python 수집기 자체가 DB에 적재하는 것은 아니다.

```powershell
python -m unittest discover -s scripts/tests -v
```

검사: 기관 간 동일 관리번호, 날짜 오류/미래 날짜, 폐업일 미제공, 중단된 다운로드, HTML 오류 응답, 캐시 변조, 보조 정보 선택 거절, 실패 실행 기록, dry-run 무변경 동작.

공통 인허가/관측 버전/사건/수집 실행 DB와 청크 적재는 [별도 Java 도구](national-permit-db-import.md)로 구현했다. 원천 공개 주기·라이선스·좌표계와 과거 완전성 검증을 함께 유지한다.
