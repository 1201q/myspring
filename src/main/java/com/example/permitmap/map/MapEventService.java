package com.example.permitmap.map;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MapEventService {
    private static final int LIMIT = 100000;
    private final JdbcTemplate jdbc;
    private final Semaphore slots = new Semaphore(2);
    public MapEventService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Event(long id, String kind, LocalDate date, double longitude, double latitude) {}
    public record Result(List<Event> items, boolean truncated) {}

    public Result find(String bbox, String category, LocalDate from, LocalDate to) {
        var bounds = MapQueryService.Bounds.parse(bbox);
        if(from == null || to == null || !from.isBefore(to) || ChronoUnit.DAYS.between(from,to)>366L*50)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"기간은 시작일 이상, 종료일 미만이며 최대 50년입니다.");
        if(category != null && MapQueryService.CATEGORIES.stream().noneMatch(c -> c.id().equals(category)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"지원하지 않는 업종입니다.");
        if(!slots.tryAcquire())
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"이벤트 조회 중입니다. 잠시 후 다시 시도하세요.");
        try {
            var args = new ArrayList<Object>(List.of(bounds.west(),bounds.south(),bounds.east(),bounds.north()));
            String sql = """
                WITH candidates AS MATERIALIZED (
                  SELECT id,permitted_on,closed_on,geom FROM national_permit_map_tile_point
                  WHERE ST_Intersects(geom,ST_Transform(ST_MakeEnvelope(?,?,?,?,4326),3857))
                """;
            if(category != null) { sql += " AND category_id=?"; args.add(category); }
            sql += """
                ) SELECT p.id,e.kind,e.event_date,ST_X(ST_Transform(p.geom,4326)) AS longitude,
                    ST_Y(ST_Transform(p.geom,4326)) AS latitude
                  FROM candidates p CROSS JOIN LATERAL
                    (VALUES ('OPEN',p.permitted_on),('CLOSE',p.closed_on)) e(kind,event_date)
                  WHERE e.event_date>=? AND e.event_date<? LIMIT ?
                """;
            args.add(from); args.add(to); args.add(LIMIT+1);
            final String statement = sql;
            List<Event> rows = jdbc.query(connection -> {
                var prepared = connection.prepareStatement(statement);
                prepared.setQueryTimeout(8);
                for(int i=0;i<args.size();i++) prepared.setObject(i+1,args.get(i));
                return prepared;
            }, (rs,n) -> new Event(rs.getLong("id"),rs.getString("kind"),rs.getObject("event_date",LocalDate.class),
                rs.getDouble("longitude"),rs.getDouble("latitude")));
            // Never silently play a sample as if it were the full event history.
            return new Result(rows.size()>LIMIT ? List.of() : List.copyOf(rows),rows.size()>LIMIT);
        } finally { slots.release(); }
    }
}
