# 전국 인허가 업종 카탈로그

확인 시각(UTC): 2026-11-04T10:01:58.090994+00:00

공식 현재 메뉴의 208개 서비스 메타데이터를 확인했다. 인허가 업종은 195종, 기타/보조 정보는 13종이다.

개·폐업 지도용 공통 필드가 있는 업종은 186종이다. 필드가 있다는 사실은 값의 누락률·좌표 정확도·과거 자료 완전성을 보장하지 않는다.

전체 CSV 다운로드와 행 검증 기록이 있는 업종은 5종이다. 나머지는 공식 조회 화면의 필드와 서비스 ID를 확인했으며, CSV/API 경로 템플릿을 기록했다. 각 파일의 실제 다운로드 가능 여부와 인증 API는 개별 검증 전이다.

## 사용 범위

- 수집 대상 카탈로그는 인허가 195종을 모두 유지한다. 업종별 상권 분석 적합성은 별도 검토한다.
- 현재 지도는 여전히 구로구 일반음식점 50건 샘플이다. 이 목록을 DB에 적재한 것은 아니다.
- CCTV·공중화장실·세차장 현황 같은 보조 정보는 인허가 사건에 섞지 않는다.
- 폐업일 필드가 없는 업종은 신규 인허가 분석과 폐업 분석의 지원 범위를 구분한다.
- 인허가 주소가 실제 대면 영업 장소인지 확인한다. 공장·온라인 판매·본사 등록 등을 모두 점포 수로 합산하지 않는다.
- `source_service_id`/`slug`는 공식 메뉴의 서비스 식별자다. 메뉴에서 확인되지 않은 숫자 업종 코드는 NULL로 남겼다.
- 좌표계는 업종별 공식 카탈로그와 실제 좌표로 검증한다. 현재 3종의 카탈로그 선언만 별도로 연결했고 전체 업종에 EPSG:5174를 적용하지 않았다.

## 출처 분류별 현황

| 공식 분류 | 서비스 수 |
| --- | ---: |
| 별도 보조 정보 | 13 |
| 건강 | 13 |
| 기타 | 16 |
| 동물 | 18 |
| 문화 | 53 |
| 생활 | 26 |
| 식품 | 32 |
| 자원환경 | 37 |

## 폐업일 필드가 없는 인허가 업종

다음 업종은 모두 `CLSBIZ_YMD`가 공식 조회 필드 목록에 없다. 취소·말소 등 다른 날짜가 있더라도 실제 폐업과 같은 사건으로 자동 치환하지 않는다.

- 담배수입판매업체 (`tobacco_import_retailers`)
- 문화예술법인 (`cultural_art_corporations`)
- 지방문화원 (`local_culture_centers`)
- 목재수입유통업 (`lumber_import_distribution`)
- 원목생산업 (`log_production`)
- 제재업 (`sawmills`)
- 지하수시공업체 (`groundwater_construction`)
- 지하수영향조사기관 (`groundwater_impact_assessment`)
- 지하수정화업체 (`groundwater_remediation`)

## 건강

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [병원](https://sample.localdata.go.kr/public/hospitals/info) | `hospitals` | 있음 | 있음 | 개별 미검증 |
| [부속의료기관](https://sample.localdata.go.kr/public/affiliated_medical_institutions/info) | `affiliated_medical_institutions` | 있음 | 있음 | 개별 미검증 |
| [산후조리업](https://sample.localdata.go.kr/public/postpartum_care/info) | `postpartum_care` | 있음 | 있음 | 개별 미검증 |
| [안경업](https://sample.localdata.go.kr/public/optical_shops/info) | `optical_shops` | 있음 | 있음 | 개별 미검증 |
| [안전상비의약품 판매업소](https://sample.localdata.go.kr/public/over_the_counter_medicine_stores/info) | `over_the_counter_medicine_stores` | 있음 | 있음 | 개별 미검증 |
| [약국](https://sample.localdata.go.kr/public/pharmacies/info) | `pharmacies` | 있음 | 있음 | 전량 검증 완료 |
| [응급환자이송업](https://sample.localdata.go.kr/public/emergency_patient_transport/info) | `emergency_patient_transport` | 있음 | 있음 | 개별 미검증 |
| [의료기기수리업](https://sample.localdata.go.kr/public/medical_device_repair/info) | `medical_device_repair` | 있음 | 있음 | 개별 미검증 |
| [의료기기판매(임대)업](https://sample.localdata.go.kr/public/medical_device_sales_rental/info) | `medical_device_sales_rental` | 있음 | 있음 | 개별 미검증 |
| [의료법인](https://sample.localdata.go.kr/public/medical_corporations/info) | `medical_corporations` | 있음 | 있음 | 개별 미검증 |
| [의료유사업](https://sample.localdata.go.kr/public/medical_related_businesses/info) | `medical_related_businesses` | 있음 | 있음 | 개별 미검증 |
| [의원](https://sample.localdata.go.kr/public/clinics/info) | `clinics` | 있음 | 있음 | 개별 미검증 |
| [치과기공소](https://sample.localdata.go.kr/public/dental_labs/info) | `dental_labs` | 있음 | 있음 | 개별 미검증 |

## 기타

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [국제물류주선업](https://sample.localdata.go.kr/public/international_logistics_forwarders/info) | `international_logistics_forwarders` | 있음 | 있음 | 개별 미검증 |
| [담배도매업](https://sample.localdata.go.kr/public/tobacco_wholesalers/info) | `tobacco_wholesalers` | 있음 | 있음 | 개별 미검증 |
| [담배소매업](https://sample.localdata.go.kr/public/tobacco_retailers/info) | `tobacco_retailers` | 있음 | 있음 | 개별 미검증 |
| [담배수입판매업체](https://sample.localdata.go.kr/public/tobacco_import_retailers/info) | `tobacco_import_retailers` | 없음 | 있음 | 개별 미검증 |
| [무료직업소개소](https://sample.localdata.go.kr/public/free_job_centers/info) | `free_job_centers` | 있음 | 있음 | 개별 미검증 |
| [물류창고업체](https://sample.localdata.go.kr/public/logistics_warehouses/info) | `logistics_warehouses` | 있음 | 있음 | 개별 미검증 |
| [민방위급수시설](https://sample.localdata.go.kr/public/civil_defense_water_facilities/info) | `civil_defense_water_facilities` | 있음 | 있음 | 개별 미검증 |
| [상조업](https://sample.localdata.go.kr/public/funeral_service_providers/info) | `funeral_service_providers` | 있음 | 있음 | 개별 미검증 |
| [승강기유지관리업체](https://sample.localdata.go.kr/public/elevator_maintenance/info) | `elevator_maintenance` | 있음 | 있음 | 개별 미검증 |
| [승강기제조및수입업체](https://sample.localdata.go.kr/public/elevator_manufacturers_importers/info) | `elevator_manufacturers_importers` | 있음 | 있음 | 개별 미검증 |
| [옥외광고업](https://sample.localdata.go.kr/public/outdoor_advertising_companies/info) | `outdoor_advertising_companies` | 있음 | 있음 | 개별 미검증 |
| [요양보호사교육기관](https://sample.localdata.go.kr/public/caregiver_training/info) | `caregiver_training` | 있음 | 있음 | 개별 미검증 |
| [유료직업소개소](https://sample.localdata.go.kr/public/paid_job_centers/info) | `paid_job_centers` | 있음 | 있음 | 개별 미검증 |
| [인쇄사](https://sample.localdata.go.kr/public/printing_shops/info) | `printing_shops` | 있음 | 있음 | 개별 미검증 |
| [장례지도사 교육기관](https://sample.localdata.go.kr/public/funeral_director_training/info) | `funeral_director_training` | 있음 | 있음 | 개별 미검증 |
| [출판사](https://sample.localdata.go.kr/public/publishers/info) | `publishers` | 있음 | 있음 | 개별 미검증 |

## 동물

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [가축사육업](https://sample.localdata.go.kr/public/livestock_farming/info) | `livestock_farming` | 있음 | 있음 | 개별 미검증 |
| [가축인공수정소](https://sample.localdata.go.kr/public/artificial_insemination_centers/info) | `artificial_insemination_centers` | 있음 | 있음 | 개별 미검증 |
| [도축업](https://sample.localdata.go.kr/public/slaughterhouses/info) | `slaughterhouses` | 있음 | 있음 | 개별 미검증 |
| [동물미용업](https://sample.localdata.go.kr/public/pet_grooming/info) | `pet_grooming` | 있음 | 있음 | 개별 미검증 |
| [동물병원](https://sample.localdata.go.kr/public/animal_hospitals/info) | `animal_hospitals` | 있음 | 있음 | 개별 미검증 |
| [동물생산업](https://sample.localdata.go.kr/public/animal_breeding/info) | `animal_breeding` | 있음 | 있음 | 개별 미검증 |
| [동물수입업](https://sample.localdata.go.kr/public/animal_import/info) | `animal_import` | 있음 | 있음 | 개별 미검증 |
| [동물약국](https://sample.localdata.go.kr/public/animal_pharmacies/info) | `animal_pharmacies` | 있음 | 있음 | 개별 미검증 |
| [동물용의료용구판매업](https://sample.localdata.go.kr/public/veterinary_medical_equipment_sales/info) | `veterinary_medical_equipment_sales` | 있음 | 있음 | 개별 미검증 |
| [동물용의약품도매상](https://sample.localdata.go.kr/public/veterinary_drug_wholesalers/info) | `veterinary_drug_wholesalers` | 있음 | 있음 | 개별 미검증 |
| [동물운송업](https://sample.localdata.go.kr/public/animal_transport/info) | `animal_transport` | 있음 | 있음 | 개별 미검증 |
| [동물위탁관리업](https://sample.localdata.go.kr/public/animal_boarding/info) | `animal_boarding` | 있음 | 있음 | 개별 미검증 |
| [동물장묘업](https://sample.localdata.go.kr/public/animal_cremation/info) | `animal_cremation` | 있음 | 있음 | 개별 미검증 |
| [동물전시업](https://sample.localdata.go.kr/public/animal_exhibition/info) | `animal_exhibition` | 있음 | 있음 | 개별 미검증 |
| [동물판매업](https://sample.localdata.go.kr/public/animal_sales/info) | `animal_sales` | 있음 | 있음 | 개별 미검증 |
| [부화업](https://sample.localdata.go.kr/public/hatcheries/info) | `hatcheries` | 있음 | 있음 | 개별 미검증 |
| [사료제조업](https://sample.localdata.go.kr/public/feed_manufacturers/info) | `feed_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [종축업](https://sample.localdata.go.kr/public/breeding_stock_businesses/info) | `breeding_stock_businesses` | 있음 | 있음 | 개별 미검증 |

## 문화

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [게임물배급업](https://sample.localdata.go.kr/public/game_distributors/info) | `game_distributors` | 있음 | 있음 | 개별 미검증 |
| [게임물제작업](https://sample.localdata.go.kr/public/game_producers/info) | `game_producers` | 있음 | 있음 | 개별 미검증 |
| [공연장](https://sample.localdata.go.kr/public/performance_halls/info) | `performance_halls` | 있음 | 있음 | 개별 미검증 |
| [관광공연장업](https://sample.localdata.go.kr/public/tourist_performance_halls/info) | `tourist_performance_halls` | 있음 | 있음 | 개별 미검증 |
| [관광궤도업](https://sample.localdata.go.kr/public/tourist_railways/info) | `tourist_railways` | 있음 | 있음 | 개별 미검증 |
| [관광극장유흥업](https://sample.localdata.go.kr/public/tourist_theater_entertainment/info) | `tourist_theater_entertainment` | 있음 | 있음 | 개별 미검증 |
| [관광사업자](https://sample.localdata.go.kr/public/tourism_businesses/info) | `tourism_businesses` | 있음 | 있음 | 개별 미검증 |
| [관광숙박업](https://sample.localdata.go.kr/public/tourist_accommodations/info) | `tourist_accommodations` | 있음 | 있음 | 개별 미검증 |
| [관광유람선업](https://sample.localdata.go.kr/public/tourist_cruises/info) | `tourist_cruises` | 있음 | 있음 | 개별 미검증 |
| [관광펜션업](https://sample.localdata.go.kr/public/tourist_pensions/info) | `tourist_pensions` | 있음 | 있음 | 개별 미검증 |
| [국내여행업](https://sample.localdata.go.kr/public/domestic_travel_agencies/info) | `domestic_travel_agencies` | 있음 | 있음 | 개별 미검증 |
| [국내외여행업](https://sample.localdata.go.kr/public/domestic_international_travel_agencies/info) | `domestic_international_travel_agencies` | 있음 | 있음 | 개별 미검증 |
| [국제회의기획업](https://sample.localdata.go.kr/public/international_convention_planners/info) | `international_convention_planners` | 있음 | 있음 | 개별 미검증 |
| [국제회의시설업](https://sample.localdata.go.kr/public/international_convention_facilities/info) | `international_convention_facilities` | 있음 | 있음 | 개별 미검증 |
| [노래연습장업](https://sample.localdata.go.kr/public/karaoke_rooms/info) | `karaoke_rooms` | 있음 | 있음 | 전량 검증 완료 |
| [농어촌민박업](https://sample.localdata.go.kr/public/rural_homestays/info) | `rural_homestays` | 있음 | 있음 | 개별 미검증 |
| [대중문화예술기획업](https://sample.localdata.go.kr/public/pop_culture_art_planners/info) | `pop_culture_art_planners` | 있음 | 있음 | 개별 미검증 |
| [문화예술법인](https://sample.localdata.go.kr/public/cultural_art_corporations/info) | `cultural_art_corporations` | 없음 | 있음 | 개별 미검증 |
| [박물관 및 미술관](https://sample.localdata.go.kr/public/museums_and_art_galleries/info) | `museums_and_art_galleries` | 있음 | 있음 | 개별 미검증 |
| [복합영상물제공업](https://sample.localdata.go.kr/public/mixed_video_content_providers/info) | `mixed_video_content_providers` | 있음 | 있음 | 개별 미검증 |
| [복합유통게임제공업](https://sample.localdata.go.kr/public/mixed_game_providers/info) | `mixed_game_providers` | 있음 | 있음 | 개별 미검증 |
| [비디오물감상실업](https://sample.localdata.go.kr/public/video_viewing_rooms/info) | `video_viewing_rooms` | 있음 | 있음 | 개별 미검증 |
| [비디오물배급업](https://sample.localdata.go.kr/public/video_distributors/info) | `video_distributors` | 있음 | 있음 | 개별 미검증 |
| [비디오물소극장업](https://sample.localdata.go.kr/public/video_mini_theaters/info) | `video_mini_theaters` | 있음 | 있음 | 개별 미검증 |
| [비디오물시청제공업](https://sample.localdata.go.kr/public/video_streaming_providers/info) | `video_streaming_providers` | 있음 | 있음 | 개별 미검증 |
| [비디오물제작업](https://sample.localdata.go.kr/public/video_producers/info) | `video_producers` | 있음 | 있음 | 개별 미검증 |
| [숙박업](https://sample.localdata.go.kr/public/lodgings/info) | `lodgings` | 있음 | 있음 | 개별 미검증 |
| [시내순환관광업](https://sample.localdata.go.kr/public/city_tour_businesses/info) | `city_tour_businesses` | 있음 | 있음 | 개별 미검증 |
| [영화배급업](https://sample.localdata.go.kr/public/film_distributors/info) | `film_distributors` | 있음 | 있음 | 개별 미검증 |
| [영화상영관](https://sample.localdata.go.kr/public/movie_theaters/info) | `movie_theaters` | 있음 | 있음 | 개별 미검증 |
| [영화상영업](https://sample.localdata.go.kr/public/film_screenings/info) | `film_screenings` | 있음 | 있음 | 개별 미검증 |
| [영화수입업](https://sample.localdata.go.kr/public/film_importers/info) | `film_importers` | 있음 | 있음 | 개별 미검증 |
| [영화제작업](https://sample.localdata.go.kr/public/film_producers/info) | `film_producers` | 있음 | 있음 | 개별 미검증 |
| [온라인음악서비스제공업](https://sample.localdata.go.kr/public/online_music_services/info) | `online_music_services` | 있음 | 있음 | 개별 미검증 |
| [외국인관광도시민박업](https://sample.localdata.go.kr/public/foreigner_city_homestays/info) | `foreigner_city_homestays` | 있음 | 있음 | 개별 미검증 |
| [음반물배급업](https://sample.localdata.go.kr/public/record_distributors/info) | `record_distributors` | 있음 | 있음 | 개별 미검증 |
| [음반물제작업](https://sample.localdata.go.kr/public/record_producers/info) | `record_producers` | 있음 | 있음 | 개별 미검증 |
| [음반및음악영상물배급업](https://sample.localdata.go.kr/public/music_video_distributors/info) | `music_video_distributors` | 있음 | 있음 | 개별 미검증 |
| [음반및음악영상물제작업](https://sample.localdata.go.kr/public/music_video_producers/info) | `music_video_producers` | 있음 | 있음 | 개별 미검증 |
| [인터넷컴퓨터게임시설제공업](https://sample.localdata.go.kr/public/pc_bangs/info) | `pc_bangs` | 있음 | 있음 | 개별 미검증 |
| [일반게임제공업](https://sample.localdata.go.kr/public/general_game_providers/info) | `general_game_providers` | 있음 | 있음 | 개별 미검증 |
| [일반야영장업](https://sample.localdata.go.kr/public/general_campgrounds/info) | `general_campgrounds` | 있음 | 있음 | 개별 미검증 |
| [일반테마파크업](https://sample.localdata.go.kr/public/general_amusement_facilities/info) | `general_amusement_facilities` | 있음 | 있음 | 개별 미검증 |
| [자동차야영장업](https://sample.localdata.go.kr/public/auto_campgrounds/info) | `auto_campgrounds` | 있음 | 있음 | 개별 미검증 |
| [전문휴양업](https://sample.localdata.go.kr/public/special_resorts/info) | `special_resorts` | 있음 | 있음 | 개별 미검증 |
| [전통사찰](https://sample.localdata.go.kr/public/traditional_temples/info) | `traditional_temples` | 있음 | 있음 | 개별 미검증 |
| [종합여행업](https://sample.localdata.go.kr/public/comprehensive_travel_agencies/info) | `comprehensive_travel_agencies` | 있음 | 있음 | 개별 미검증 |
| [종합테마파크업](https://sample.localdata.go.kr/public/comprehensive_amusement_facilities/info) | `comprehensive_amusement_facilities` | 있음 | 있음 | 개별 미검증 |
| [종합휴양업](https://sample.localdata.go.kr/public/comprehensive_resorts/info) | `comprehensive_resorts` | 있음 | 있음 | 개별 미검증 |
| [지방문화원](https://sample.localdata.go.kr/public/local_culture_centers/info) | `local_culture_centers` | 없음 | 있음 | 개별 미검증 |
| [청소년게임제공업](https://sample.localdata.go.kr/public/youth_game_providers/info) | `youth_game_providers` | 있음 | 있음 | 개별 미검증 |
| [테마파크업(기타)](https://sample.localdata.go.kr/public/amusement_facilities_other/info) | `amusement_facilities_other` | 있음 | 있음 | 개별 미검증 |
| [한옥체험업](https://sample.localdata.go.kr/public/hanok_experience/info) | `hanok_experience` | 있음 | 있음 | 개별 미검증 |

## 생활

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [골프연습장업](https://sample.localdata.go.kr/public/golf_practice_ranges/info) | `golf_practice_ranges` | 있음 | 있음 | 개별 미검증 |
| [골프장](https://sample.localdata.go.kr/public/golf_courses/info) | `golf_courses` | 있음 | 있음 | 개별 미검증 |
| [다단계판매업체](https://sample.localdata.go.kr/public/multilevel_marketing/info) | `multilevel_marketing` | 있음 | 있음 | 개별 미검증 |
| [당구장업](https://sample.localdata.go.kr/public/billiard_halls/info) | `billiard_halls` | 있음 | 있음 | 개별 미검증 |
| [대규모점포](https://sample.localdata.go.kr/public/large_scale_retail_stores/info) | `large_scale_retail_stores` | 있음 | 있음 | 개별 미검증 |
| [등록체육시설업](https://sample.localdata.go.kr/public/registered_sports_facilities/info) | `registered_sports_facilities` | 있음 | 있음 | 개별 미검증 |
| [목욕장업](https://sample.localdata.go.kr/public/public_baths/info) | `public_baths` | 있음 | 있음 | 개별 미검증 |
| [무도장업](https://sample.localdata.go.kr/public/dance_halls/info) | `dance_halls` | 있음 | 있음 | 개별 미검증 |
| [무도학원업](https://sample.localdata.go.kr/public/dance_academies/info) | `dance_academies` | 있음 | 있음 | 개별 미검증 |
| [미용업](https://sample.localdata.go.kr/public/beauty_salons/info) | `beauty_salons` | 있음 | 있음 | 전량 검증 완료 |
| [방문판매업](https://sample.localdata.go.kr/public/door_to_door_sales/info) | `door_to_door_sales` | 있음 | 있음 | 개별 미검증 |
| [빙상장업](https://sample.localdata.go.kr/public/ice_rinks/info) | `ice_rinks` | 있음 | 있음 | 개별 미검증 |
| [세탁업](https://sample.localdata.go.kr/public/laundries/info) | `laundries` | 있음 | 있음 | 개별 미검증 |
| [수영장업](https://sample.localdata.go.kr/public/swimming_pools/info) | `swimming_pools` | 있음 | 있음 | 개별 미검증 |
| [스키장](https://sample.localdata.go.kr/public/ski_resorts/info) | `ski_resorts` | 있음 | 있음 | 개별 미검증 |
| [승마장업](https://sample.localdata.go.kr/public/horse_riding/info) | `horse_riding` | 있음 | 있음 | 개별 미검증 |
| [썰매장업](https://sample.localdata.go.kr/public/sledding/info) | `sledding` | 있음 | 있음 | 개별 미검증 |
| [요트장업](https://sample.localdata.go.kr/public/yacht_marinas/info) | `yacht_marinas` | 있음 | 있음 | 개별 미검증 |
| [의료기관세탁물처리업](https://sample.localdata.go.kr/public/medical_laundry/info) | `medical_laundry` | 있음 | 있음 | 개별 미검증 |
| [이용업](https://sample.localdata.go.kr/public/barber_shops/info) | `barber_shops` | 있음 | 있음 | 개별 미검증 |
| [전화권유판매업](https://sample.localdata.go.kr/public/telemarketing_sales/info) | `telemarketing_sales` | 있음 | 있음 | 개별 미검증 |
| [종합체육시설업](https://sample.localdata.go.kr/public/comprehensive_sports_facilities/info) | `comprehensive_sports_facilities` | 있음 | 있음 | 개별 미검증 |
| [체력단련장업](https://sample.localdata.go.kr/public/fitness_centers/info) | `fitness_centers` | 있음 | 있음 | 개별 미검증 |
| [체육도장업](https://sample.localdata.go.kr/public/martial_arts_dojo/info) | `martial_arts_dojo` | 있음 | 있음 | 개별 미검증 |
| [통신판매업](https://sample.localdata.go.kr/public/ecommerce_businesses/info) | `ecommerce_businesses` | 있음 | 있음 | 개별 미검증 |
| [후원방문판매업체](https://sample.localdata.go.kr/public/sponsored_door_to_door_sales/info) | `sponsored_door_to_door_sales` | 있음 | 있음 | 개별 미검증 |

## 식품

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [건강기능식품유통전문판매업](https://sample.localdata.go.kr/public/health_functional_food_specialty_retailers/info) | `health_functional_food_specialty_retailers` | 있음 | 있음 | 개별 미검증 |
| [건강기능식품일반판매업](https://sample.localdata.go.kr/public/health_functional_food_general_retailers/info) | `health_functional_food_general_retailers` | 있음 | 있음 | 개별 미검증 |
| [관광식당](https://sample.localdata.go.kr/public/tourist_restaurants/info) | `tourist_restaurants` | 있음 | 있음 | 개별 미검증 |
| [관광유흥음식점업](https://sample.localdata.go.kr/public/tourist_entertainment_restaurants/info) | `tourist_entertainment_restaurants` | 있음 | 있음 | 개별 미검증 |
| [단란주점영업](https://sample.localdata.go.kr/public/singing_bars/info) | `singing_bars` | 있음 | 있음 | 개별 미검증 |
| [식용얼음판매업](https://sample.localdata.go.kr/public/edible_ice_retailers/info) | `edible_ice_retailers` | 있음 | 있음 | 개별 미검증 |
| [식육포장처리업](https://sample.localdata.go.kr/public/meat_packers/info) | `meat_packers` | 있음 | 있음 | 개별 미검증 |
| [식품냉동냉장업](https://sample.localdata.go.kr/public/food_freezing_refrigeration/info) | `food_freezing_refrigeration` | 있음 | 있음 | 개별 미검증 |
| [식품소분업](https://sample.localdata.go.kr/public/food_repackagers/info) | `food_repackagers` | 있음 | 있음 | 개별 미검증 |
| [식품운반업](https://sample.localdata.go.kr/public/food_transporters/info) | `food_transporters` | 있음 | 있음 | 개별 미검증 |
| [식품자동판매기업](https://sample.localdata.go.kr/public/food_vending_machines/info) | `food_vending_machines` | 있음 | 있음 | 개별 미검증 |
| [식품제조가공업](https://sample.localdata.go.kr/public/food_manufacturing_processors/info) | `food_manufacturing_processors` | 있음 | 있음 | 개별 미검증 |
| [식품첨가물제조업](https://sample.localdata.go.kr/public/food_additive_manufacturers/info) | `food_additive_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [식품판매업(기타)](https://sample.localdata.go.kr/public/other_food_retailers/info) | `other_food_retailers` | 있음 | 있음 | 개별 미검증 |
| [옹기류제조업](https://sample.localdata.go.kr/public/onggi_manufacturers/info) | `onggi_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [외국인전용유흥음식점업](https://sample.localdata.go.kr/public/foreigners_entertainment_restaurants/info) | `foreigners_entertainment_restaurants` | 있음 | 있음 | 개별 미검증 |
| [용기냉동기특정설비](https://sample.localdata.go.kr/public/container_refrigeration_equipment/info) | `container_refrigeration_equipment` | 있음 | 있음 | 개별 미검증 |
| [용기및포장지제조업](https://sample.localdata.go.kr/public/container_packaging_manufacturers/info) | `container_packaging_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [위탁급식영업](https://sample.localdata.go.kr/public/contract_catering/info) | `contract_catering` | 있음 | 있음 | 개별 미검증 |
| [유통전문판매업](https://sample.localdata.go.kr/public/distribution_specialty_retailers/info) | `distribution_specialty_retailers` | 있음 | 있음 | 개별 미검증 |
| [유흥주점영업](https://sample.localdata.go.kr/public/entertainment_bars/info) | `entertainment_bars` | 있음 | 있음 | 개별 미검증 |
| [일반음식점](https://sample.localdata.go.kr/public/general_restaurants/info) | `general_restaurants` | 있음 | 있음 | 전량 검증 완료 |
| [제과점영업](https://sample.localdata.go.kr/public/bakeries/info) | `bakeries` | 있음 | 있음 | 개별 미검증 |
| [즉석판매제조가공업](https://sample.localdata.go.kr/public/instant_food_processors/info) | `instant_food_processors` | 있음 | 있음 | 개별 미검증 |
| [집단급식소](https://sample.localdata.go.kr/public/group_meal_facilities/info) | `group_meal_facilities` | 있음 | 있음 | 개별 미검증 |
| [집단급식소식품판매업](https://sample.localdata.go.kr/public/group_meal_food_retailers/info) | `group_meal_food_retailers` | 있음 | 있음 | 개별 미검증 |
| [집유업](https://sample.localdata.go.kr/public/milk_collection/info) | `milk_collection` | 있음 | 있음 | 개별 미검증 |
| [축산가공업](https://sample.localdata.go.kr/public/livestock_processing/info) | `livestock_processing` | 있음 | 있음 | 개별 미검증 |
| [축산물보관업](https://sample.localdata.go.kr/public/livestock_storage/info) | `livestock_storage` | 있음 | 있음 | 개별 미검증 |
| [축산물운반업](https://sample.localdata.go.kr/public/livestock_transport/info) | `livestock_transport` | 있음 | 있음 | 개별 미검증 |
| [축산판매업](https://sample.localdata.go.kr/public/livestock_retail/info) | `livestock_retail` | 있음 | 있음 | 개별 미검증 |
| [휴게음식점](https://sample.localdata.go.kr/public/rest_cafes/info) | `rest_cafes` | 있음 | 있음 | 개별 미검증 |

## 자원환경

| 업종·공식 조회 화면 | 서비스 ID | 폐업일 필드 | X/Y 필드 | 전체 CSV |
| --- | --- | --- | --- | --- |
| [가축분뇨배출시설관리업(사업장)](https://sample.localdata.go.kr/public/manure_facility_management/info) | `manure_facility_management` | 있음 | 있음 | 개별 미검증 |
| [가축분뇨수집운반업](https://sample.localdata.go.kr/public/manure_collection_transport/info) | `manure_collection_transport` | 있음 | 있음 | 개별 미검증 |
| [개인하수처리시설관리업(사업장)](https://sample.localdata.go.kr/public/small_sewage_facility_management/info) | `small_sewage_facility_management` | 있음 | 있음 | 개별 미검증 |
| [건물위생관리업](https://sample.localdata.go.kr/public/building_sanitation/info) | `building_sanitation` | 있음 | 있음 | 개별 미검증 |
| [건설폐기물처리업](https://sample.localdata.go.kr/public/construction_waste_disposal/info) | `construction_waste_disposal` | 있음 | 있음 | 개별 미검증 |
| [계량기수리업](https://sample.localdata.go.kr/public/weighing_instrument_repair/info) | `weighing_instrument_repair` | 있음 | 있음 | 개별 미검증 |
| [계량기수입업](https://sample.localdata.go.kr/public/weighing_instrument_import/info) | `weighing_instrument_import` | 있음 | 있음 | 개별 미검증 |
| [계량기제조업](https://sample.localdata.go.kr/public/weighing_instrument_manufacturing/info) | `weighing_instrument_manufacturing` | 있음 | 있음 | 개별 미검증 |
| [계량기증명업](https://sample.localdata.go.kr/public/weighing_instrument_certification/info) | `weighing_instrument_certification` | 있음 | 있음 | 개별 미검증 |
| [고압가스업](https://sample.localdata.go.kr/public/high_pressure_gas/info) | `high_pressure_gas` | 있음 | 있음 | 개별 미검증 |
| [급수공사대행업](https://sample.localdata.go.kr/public/water_supply_agents/info) | `water_supply_agents` | 있음 | 있음 | 개별 미검증 |
| [단독정화조 및 오수처리시설설계시공업](https://sample.localdata.go.kr/public/septic_sewage_design_build/info) | `septic_sewage_design_build` | 있음 | 있음 | 개별 미검증 |
| [대기오염물질배출시설설치사업장](https://sample.localdata.go.kr/public/air_pollution_facility_installation/info) | `air_pollution_facility_installation` | 있음 | 있음 | 개별 미검증 |
| [목재수입유통업](https://sample.localdata.go.kr/public/lumber_import_distribution/info) | `lumber_import_distribution` | 없음 | 있음 | 전량 검증 완료 |
| [배출가스전문정비사업자(확인검사대행자)](https://sample.localdata.go.kr/public/emission_inspection_agencies/info) | `emission_inspection_agencies` | 있음 | 있음 | 개별 미검증 |
| [분뇨수집운반업](https://sample.localdata.go.kr/public/night_soil_collection_transport/info) | `night_soil_collection_transport` | 있음 | 있음 | 개별 미검증 |
| [석연탄제조업](https://sample.localdata.go.kr/public/briquette_manufacturers/info) | `briquette_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [석유및석유대체연료판매업체](https://sample.localdata.go.kr/public/petroleum_alt_fuel_retailers/info) | `petroleum_alt_fuel_retailers` | 있음 | 있음 | 개별 미검증 |
| [석유판매업](https://sample.localdata.go.kr/public/oil_retailers/info) | `oil_retailers` | 있음 | 있음 | 개별 미검증 |
| [소독업](https://sample.localdata.go.kr/public/disinfection_companies/info) | `disinfection_companies` | 있음 | 있음 | 개별 미검증 |
| [수질오염원설치시설(기타)](https://sample.localdata.go.kr/public/water_pollution_source_other/info) | `water_pollution_source_other` | 있음 | 있음 | 개별 미검증 |
| [쓰레기종량제봉투판매업](https://sample.localdata.go.kr/public/pay_as_you_throw_bag_retailers/info) | `pay_as_you_throw_bag_retailers` | 있음 | 있음 | 개별 미검증 |
| [액화석유가스용품제조업체](https://sample.localdata.go.kr/public/lpg_equipment_manufacturers/info) | `lpg_equipment_manufacturers` | 있음 | 있음 | 개별 미검증 |
| [원목생산업](https://sample.localdata.go.kr/public/log_production/info) | `log_production` | 없음 | 있음 | 개별 미검증 |
| [일반도시가스업체](https://sample.localdata.go.kr/public/city_gas_companies/info) | `city_gas_companies` | 있음 | 있음 | 개별 미검증 |
| [저수조청소업](https://sample.localdata.go.kr/public/water_tank_cleaning/info) | `water_tank_cleaning` | 있음 | 있음 | 개별 미검증 |
| [전력기술감리업체](https://sample.localdata.go.kr/public/power_supervision_companies/info) | `power_supervision_companies` | 있음 | 있음 | 개별 미검증 |
| [전력기술설계업체](https://sample.localdata.go.kr/public/power_design_companies/info) | `power_design_companies` | 있음 | 있음 | 개별 미검증 |
| [제재업](https://sample.localdata.go.kr/public/sawmills/info) | `sawmills` | 없음 | 있음 | 개별 미검증 |
| [지하수시공업체](https://sample.localdata.go.kr/public/groundwater_construction/info) | `groundwater_construction` | 없음 | 있음 | 개별 미검증 |
| [지하수영향조사기관](https://sample.localdata.go.kr/public/groundwater_impact_assessment/info) | `groundwater_impact_assessment` | 없음 | 있음 | 개별 미검증 |
| [지하수정화업체](https://sample.localdata.go.kr/public/groundwater_remediation/info) | `groundwater_remediation` | 없음 | 있음 | 개별 미검증 |
| [특정고압가스업](https://sample.localdata.go.kr/public/specific_high_pressure_gas/info) | `specific_high_pressure_gas` | 있음 | 있음 | 개별 미검증 |
| [환경관리대행기관](https://sample.localdata.go.kr/public/environment_management_agencies/info) | `environment_management_agencies` | 있음 | 있음 | 개별 미검증 |
| [환경전문공사업](https://sample.localdata.go.kr/public/environment_contractors/info) | `environment_contractors` | 있음 | 있음 | 개별 미검증 |
| [환경측정대행업](https://sample.localdata.go.kr/public/environment_measurement_agencies/info) | `environment_measurement_agencies` | 있음 | 있음 | 개별 미검증 |
| [환경컨설팅회사](https://sample.localdata.go.kr/public/environment_consulting_companies/info) | `environment_consulting_companies` | 있음 | 있음 | 개별 미검증 |

## 기타/보조 정보

- [CCTV정보](https://sample.localdata.go.kr/public/cctv_info/info) (`cctv_info`)
- [공중화장실정보](https://sample.localdata.go.kr/public/public_restroom_info/info) (`public_restroom_info`)
- [과속방지턱정보](https://sample.localdata.go.kr/public/speed_bump_info/info) (`speed_bump_info`)
- [낚시터정보](https://sample.localdata.go.kr/public/fishing_spot_info/info) (`fishing_spot_info`)
- [모범음식점정보](https://sample.localdata.go.kr/public/excellent_restaurant_info/info) (`excellent_restaurant_info`)
- [무료와이파이정보](https://sample.localdata.go.kr/public/free_wifi_info/info) (`free_wifi_info`)
- [민방위대피시설](https://sample.localdata.go.kr/public/civil_defense_shelter_info/info) (`civil_defense_shelter_info`)
- [보호수정보](https://sample.localdata.go.kr/public/protected_tree_info/info) (`protected_tree_info`)
- [비산먼지발생사업정보](https://sample.localdata.go.kr/public/dust_emission_business_info/info) (`dust_emission_business_info`)
- [생활쓰레기배출정보](https://sample.localdata.go.kr/public/household_waste_info/info) (`household_waste_info`)
- [세차장정보](https://sample.localdata.go.kr/public/car_wash_info/info) (`car_wash_info`)
- [안전비상벨위치정보](https://sample.localdata.go.kr/public/emergency_call_box_info/info) (`emergency_call_box_info`)
- [자전거보관소정보](https://sample.localdata.go.kr/public/bicycle_parking_info/info) (`bicycle_parking_info`)

## 파일과 재현

- [기계용 카탈로그](data-samples/national/category-catalog.json): 서비스 ID, 분류, 공식 필드, 기능 지원 여부, 검증 단계.
- [생성 스크립트](../scripts/build-national-category-catalog.py): Python 3.11 이상, 표준 라이브러리만 사용.
- HTML 캐시: Git에서 제외되는 `data/national-catalog/`. 원본 HTML에는 일회성 웹 토큰이 있어 커밋하지 않는다.
- [초기 3종 원본 검사](national-data-source-audit.md), [공통 수집기](national-permit-collector.md), [DB 설계안](commercial-area-timeline-data-design.md).

```powershell
# 받은 HTML 캐시로 카탈로그 재생성
python scripts/build-national-category-catalog.py

# 공식 메뉴와 메타데이터 다시 확인 (CSV 다운로드 없음)
python scripts/build-national-category-catalog.py --refresh
```

최대 동시 2개 요청과 요청 간 대기를 사용하며, 403/429 응답 시 추가 네트워크 조회를 중단한다. 실패 항목은 JSON에 기록하고 스크립트는 실패 코드로 종료한다.

CSV 다운로드 경로와 API 기본 경로는 공식 파일/메뉴의 서비스 ID 규칙으로 구성한 후보이며, 전량 검증 완료로 표시된 업종 외에는 해당 엔드포인트의 성공 응답을 확인한 것으로 취급하지 않는다. 라이선스·좌표계·과거 제공 범위는 다음 개별 검증 단계에서 채운다.
