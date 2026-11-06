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
