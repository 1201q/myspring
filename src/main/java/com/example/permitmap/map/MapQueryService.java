package com.example.permitmap.map;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.HashSet;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MapQueryService {
    private final JdbcTemplate jdbc;
    public MapQueryService(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public record Category(String id,String name) {}
    public static final List<Category> CATEGORIES=loadCategories();
    private static List<Category> loadCategories() {
        try(var stream=new ClassPathResource("map-categories.json").getInputStream()) {
            var entries=JsonMapper.builder().build().readTree(stream).path("categories");
            var result=new ArrayList<Category>();
            var ids=new HashSet<String>();
            for(var entry:entries) {
                String id=entry.path("id").asText();
                if(entry.path("sourceCrs").asInt()!=5174 || !id.matches("[a-z_]+") || !ids.add(id))
                    throw new IllegalStateException("Invalid verified map category");
                result.add(new Category(id,entry.path("name").asText()));
            }
            if(result.isEmpty()) throw new IllegalStateException("Map categories are missing");
            return List.copyOf(result);
        } catch(IOException error) { throw new UncheckedIOException(error); }
    }
    public record Item(long id,String categoryId,String name,String businessType,String roadAddress,String lotAddress,
                       LocalDate permittedAt,LocalDate closedAt,double longitude,double latitude,String coordinateStatus,String sourceUrl) {}
    public record Result(List<Item> items,int limit,boolean truncated,LocalDate date,String locationBasis) {}
    public record Bounds(double west,double south,double east,double north) {
        public static Bounds parse(String value) {
            try {
                String[] parts=value.split(",",-1);
                if(parts.length!=4) throw new IllegalArgumentException();
                double west=Double.parseDouble(parts[0]),south=Double.parseDouble(parts[1]),east=Double.parseDouble(parts[2]),north=Double.parseDouble(parts[3]);
                if(!Double.isFinite(west)||!Double.isFinite(south)||!Double.isFinite(east)||!Double.isFinite(north)
                        ||west < -180||east>180||south < -90||north>90||west>=east||south>=north
                        ||east-west>1||north-south>1) throw new IllegalArgumentException();
                return new Bounds(west,south,east,north);
            } catch(RuntimeException error) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"bbox는 서쪽,남쪽,동쪽,북쪽 순서이며 각 폭이 1도 이하여야 합니다.");
            }
        }
    }

    public byte[] tile(int z,int x,int y,String category,LocalDate date) {
        if(z<6 || z>16 || x<0 || y<0 || x>=(1<<z) || y>=(1<<z))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"잘못된 타일 좌표입니다.");
        if(category!=null && CATEGORIES.stream().noneMatch(c -> c.id().equals(category)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"좌표계가 확인된 업종을 선택하세요.");
        var args=new ArrayList<Object>(List.of(z,x,y));
        // The compact, indexed serving snapshot is refreshed after data publication.
        String sql="""
            WITH bounds AS NOT MATERIALIZED (SELECT ST_TileEnvelope(?,?,?) AS geom), points AS (
              SELECT p.id,p.closed_on,p.geom
              FROM national_permit_map_tile_point p CROSS JOIN bounds b
              WHERE p.geom && ST_Expand(b.geom,(ST_XMax(b.geom)-ST_XMin(b.geom))*
            """;
        // Aggregate cells align with tile boundaries; only individual points need a buffer.
        sql+=(z<15 ? "0" : "64.0/4096")+")";
        if(z<15) sql+=" AND ST_X(p.geom)>=ST_XMin(b.geom) AND ST_X(p.geom)<ST_XMax(b.geom)"
            +" AND ST_Y(p.geom)>=ST_YMin(b.geom) AND ST_Y(p.geom)<ST_YMax(b.geom)";
        if(category!=null) { sql+=" AND p.category_id=?"; args.add(category); }
        if(date!=null) { sql+=" AND p.permitted_on<=? AND (p.closed_on IS NULL OR p.closed_on>?)"; args.add(date); args.add(date); }
        if(z<15) {
            // Globally aligned 32-pixel cells, with no arbitrary row limit.
            double cell=40075016.68557849/(1<<z)/16;
            sql+="""
                ), grouped AS (
                  SELECT count(*) AS count,ST_SetSRID(ST_MakePoint(avg(ST_X(geom)),avg(ST_Y(geom))),3857) AS geom
                  FROM points GROUP BY floor(ST_X(geom)/?),floor(ST_Y(geom)/?)
                ), encoded AS (
                  SELECT count,ST_AsMVTGeom(g.geom,b.geom,4096,64,true) AS geom
                  FROM grouped g CROSS JOIN bounds b
                ) SELECT ST_AsMVT(encoded.*,'businesses',4096,'geom') FROM encoded
                """;
            args.add(cell); args.add(cell);
        } else {
            args.add(date == null ? LocalDate.now(java.time.ZoneId.of("Asia/Seoul")) : date);
            sql+="""
                ), encoded AS (
                  SELECT p.id::text AS id,1 AS count,
                    CASE WHEN p.closed_on<=? THEN 1 ELSE 0 END AS closed,
                    ST_AsMVTGeom(p.geom,b.geom,4096,64,true) AS geom
                  FROM points p CROSS JOIN bounds b
                ) SELECT ST_AsMVT(encoded.*,'businesses',4096,'geom') FROM encoded
                """;
        }
        final String statement=sql;
        return jdbc.query(connection -> {
            var prepared=connection.prepareStatement(statement);
            prepared.setQueryTimeout(z<15 ? 30 : 10);
            for(int i=0;i<args.size();i++) prepared.setObject(i+1,args.get(i));
            return prepared;
        }, (org.springframework.jdbc.core.ResultSetExtractor<byte[]>) rs -> rs.next() ? rs.getBytes(1) : new byte[0]);
    }

    public Item detail(long id) {
        var items=jdbc.query("""
            SELECT p.*,ST_X(l.geom) AS longitude,ST_Y(l.geom) AS latitude
            FROM national_permit_current p
            JOIN national_permit_location l ON l.permit_id=p.id AND l.content_hash=p.content_hash
              AND l.source_x=p.source_x AND l.source_y=p.source_y
            LEFT JOIN permit_category_crs c ON c.category_id=p.category_id
            JOIN permit_import_run r ON r.id=p.run_id AND r.status='COMPLETED'
            WHERE p.id=? AND l.source_crs=COALESCE(p.source_crs,c.source_crs)
            """,(rs,n) -> new Item(rs.getLong("id"),rs.getString("category_id"),rs.getString("name"),rs.getString("business_type"),
                rs.getString("road_address"),rs.getString("lot_address"),rs.getObject("permitted_on",LocalDate.class),rs.getObject("closed_on",LocalDate.class),
                rs.getDouble("longitude"),rs.getDouble("latitude"),"CONVERTED","https://sample.localdata.go.kr/public/"+rs.getString("category_id")+"/info"),id);
        if(items.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"인허가를 찾을 수 없습니다.");
        return items.getFirst();
    }

    public Result find(String bbox,String category,LocalDate date,int limit) {
        Bounds bounds=Bounds.parse(bbox);
        if(limit<1||limit>500) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"limit은 1~500입니다.");
        if(category!=null && CATEGORIES.stream().noneMatch(c -> c.id().equals(category)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"좌표계가 확인된 업종을 선택하세요.");
        var args=new ArrayList<Object>();
        // KNN mixes nearby points from all import batches instead of reading old
        // heap pages first. Fence the parent lookup so LIMIT can consume matching
        // spatial candidates incrementally, including category/date predicates.
        String sql="""
            SELECT p.id,p.category_id,p.name,p.business_type,p.road_address,p.lot_address,p.permitted_on,p.closed_on,
                   ST_X(l.geom) AS longitude,ST_Y(l.geom) AS latitude
            FROM national_permit_location l JOIN LATERAL (
              SELECT p.* FROM national_permit_current p
              LEFT JOIN permit_category_crs c ON c.category_id=p.category_id
              JOIN permit_import_run r ON r.id=p.run_id AND r.status='COMPLETED'
              WHERE p.id=l.permit_id AND p.content_hash=l.content_hash AND p.source_x=l.source_x AND p.source_y=l.source_y
                AND COALESCE(p.source_crs,c.source_crs)=l.source_crs
            """;
        if(category!=null) { sql+=" AND p.category_id=?"; args.add(category); }
        if(date!=null) { sql+=" AND p.permitted_on<=? AND (p.closed_on IS NULL OR p.closed_on>?)"; args.add(date); args.add(date); }
        sql+=" OFFSET 0) p ON TRUE WHERE ST_Intersects(l.geom,ST_MakeEnvelope(?,?,?,?,4326)) "
                +"ORDER BY l.geom <-> ST_SetSRID(ST_MakePoint(?,?),4326) LIMIT ?";
        args.addAll(List.of(bounds.west(),bounds.south(),bounds.east(),bounds.north(),
                (bounds.west()+bounds.east())/2,(bounds.south()+bounds.north())/2));
        args.add(limit+1);
        final String statement=sql;
        List<Item> items=jdbc.query(connection -> {
            var prepared=connection.prepareStatement(statement);
            prepared.setQueryTimeout(3);
            for(int i=0;i<args.size();i++) prepared.setObject(i+1,args.get(i));
            return prepared;
        },(rs,n) -> new Item(rs.getLong("id"),rs.getString("category_id"),rs.getString("name"),rs.getString("business_type"),
                rs.getString("road_address"),rs.getString("lot_address"),rs.getObject("permitted_on",LocalDate.class),rs.getObject("closed_on",LocalDate.class),
                rs.getDouble("longitude"),rs.getDouble("latitude"),"CONVERTED","https://sample.localdata.go.kr/public/"+rs.getString("category_id")+"/info"));
        return new Result(List.copyOf(items.subList(0,Math.min(limit,items.size()))),limit,items.size()>limit,date,"LATEST_KNOWN_SOURCE");
    }
}
