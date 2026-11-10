# 지역 선택 경계

행정동별 통계 경계는 `dongs/`에 별도 보관합니다. 2026-10-01 행정동 light 경계를 시도별로 나누었으며, 주소의 법정동이 아니라 좌표 기반 행정동 배정에 사용합니다. 원본 commit과 SHA-256은 `dongs/source.json`, 재생성 명령은 `npm run build:dongs`입니다. SGIS·vuski/admdongkor 출처와 아래 라이선스를 동일하게 적용합니다. 단순화 경계로 경계 부근 오차가 있을 수 있으며 미배정 기록을 별도로 표시합니다. [구현·검증 안내](../../../docs/dong-statistics.md).

`regions-20261001.geojson`은 2026-10-01 시도 경계를 지역 재생 ID에 연결한 웹 지도용 파일입니다. 전남광주 통합 지역을 포함합니다. 화면 표시·클릭 선택에 사용하며 당시 행정구역 복원이나 사업장 통계 재분류에 사용하지 않습니다.

원본은 통계청 통계지리정보서비스([SGIS](https://sgis.kostat.go.kr))에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 [vuski/admdongkor](https://github.com/vuski/admdongkor)입니다. 가공 경계는 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)으로 배포됩니다. [데이터 라이선스](https://github.com/vuski/admdongkor/blob/master/LICENSE-DATA)를 따르며 SGIS와 가공자 출처를 보존합니다.

원본 light 단순화 경계를 유지하고, 지역 ID/표시명을 추가했으며 WGS84 좌표를 소수점 6자리로 반올림했습니다. source commit, 원본 URL, 변환 내용, 파일 SHA-256은 `regions-source.json`에 기록합니다.

재생성: `frontend`에서 `npm run build:regions`. 특정 원본을 재현하려면 `REGION_BOUNDARY_COMMIT` 환경 변수에 `regions-source.json`의 commit을 지정합니다. 일반 빌드와 사용자 브라우저는 원본 저장소에 접속하지 않고 이 로컬 파일을 사용합니다.
