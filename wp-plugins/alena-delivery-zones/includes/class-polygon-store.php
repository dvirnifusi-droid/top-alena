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
    private static function point_in_polygon(float $lat, float $lng, array $coords): bool {
        $inside = false;
        $n = count($coords);
        if ($n < 3) return false;
        $j = $n - 1;
        for ($i = 0; $i < $n; $i++) {
            $xi = (float) $coords[$i][0]; // lat
            $yi = (float) $coords[$i][1]; // lng
            $xj = (float) $coords[$j][0];
            $yj = (float) $coords[$j][1];
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
