<?php
if (!defined('ABSPATH')) exit;

/**
 * Server-side Google Geocoding wrapper. Caches results in WP transients (24h)
 * to avoid burning quota for the same address repeatedly.
 */
class Alena_DZ_Geocoder {
    public static function geocode(string $address): ?array {
        $address = trim($address);
        if ($address === '') return null;

        $key = get_option('alena_dz_google_key', '');
        if (!$key) return null;

        $cache_key = 'alena_dz_geo_' . md5($address);
        $cached = get_transient($cache_key);
        if (is_array($cached)) return $cached;

        $url = add_query_arg([
            'address'  => $address,
            'key'      => $key,
            'language' => 'he',
            'region'   => 'il',
        ], 'https://maps.googleapis.com/maps/api/geocode/json');

        $resp = wp_remote_get($url, ['timeout' => 8]);
        if (is_wp_error($resp)) return null;
        $code = (int) wp_remote_retrieve_response_code($resp);
        if ($code !== 200) return null;

        $body = json_decode(wp_remote_retrieve_body($resp), true);
        if (($body['status'] ?? '') !== 'OK') return null;

        $loc = $body['results'][0]['geometry']['location'] ?? null;
        if (!$loc) return null;

        $out = ['lat' => (float) $loc['lat'], 'lng' => (float) $loc['lng']];
        set_transient($cache_key, $out, DAY_IN_SECONDS);
        return $out;
    }
}
