<?php
if (!defined('ABSPATH')) exit;

/**
 * Reads/writes the array of delivery polygons. Stored as JSON in wp_options
 * under the key 'alena_delivery_polygons'.
 *
 * Each polygon is shaped:
 *   { id, name, color, delivery_fee, min_order, coords: [[lat,lng], ...] }
 *
 * Phone is unique in domain; here the id is the unique key.
 */
class Alena_DZ_Polygon_Store {
    const OPTION_KEY = 'alena_delivery_polygons';

    public static function all(): array {
        $json = get_option(self::OPTION_KEY, '[]');
        $arr = json_decode($json, true);
        return is_array($arr) ? $arr : [];
    }

    public static function save(array $polygons): bool {
        foreach ($polygons as $p) {
            if (!isset($p['id'], $p['name'], $p['delivery_fee'], $p['min_order'], $p['coords'])) {
                return false;
            }
            if (!is_array($p['coords']) || count($p['coords']) < 3) {
                return false;
            }
        }
        return update_option(self::OPTION_KEY, wp_json_encode($polygons, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Returns the first polygon containing the given lat/lng, or null.
     */
    public static function find_containing(float $lat, float $lng): ?array {
        foreach (self::all() as $p) {
            if (self::point_in_polygon($lat, $lng, $p['coords'])) {
                return $p;
            }
        }
        return null;
    }

    /**
     * Ray-casting algorithm. Coords are [[lat,lng], ...].
     */
    /**
     * A vertex is stored by the map editor as {lat, lng}, but older data used
     * [lat, lng]. Reading only the indexed form yielded null on the keyed form,
     * and (float) null is 0.0 — every polygon collapsed to the point (0,0), so
     * no address in Israel matched any zone and delivery was never offered.
     */
    private static function vertex(array $coords, int $i): array {
        $c = $coords[$i] ?? [];
        if (!is_array($c)) return [0.0, 0.0];
        $lat = $c['lat'] ?? $c[0] ?? 0;
        $lng = $c['lng'] ?? $c[1] ?? 0;
        return [(float) $lat, (float) $lng];
    }

    private static function point_in_polygon(float $lat, float $lng, array $coords): bool {
        $inside = false;
        $coords = array_values($coords);
        $n = count($coords);
        if ($n < 3) return false;
        $j = $n - 1;
        for ($i = 0; $i < $n; $i++) {
            [$xi, $yi] = self::vertex($coords, $i); // lat, lng
            [$xj, $yj] = self::vertex($coords, $j);
            $denom = ($yj - $yi);
            if ($denom == 0.0) $denom = 1e-12;
            $intersect = (($yi > $lng) !== ($yj > $lng)) &&
                         ($lat < ($xj - $xi) * ($lng - $yi) / $denom + $xi);
            if ($intersect) $inside = !$inside;
            $j = $i;
        }
        return $inside;
    }
}
