<?php
if (!defined('ABSPATH')) exit;

/**
 * One wallet, matched to the device -- and Bit off for now.
 *
 * PayPlus exposes Apple Pay and Google Pay as two separate gateways; they
 * cannot be merged in its settings. Showing both means every customer sees a
 * wallet they cannot use. So the irrelevant one is removed per request and the
 * survivor is put first, which is also what WooCommerce preselects.
 *
 * Nothing here touches the gateways' own settings. Everything is a runtime
 * filter, so turning any of it back on is a one-line change and no payment
 * configuration was altered.
 */
class Alena_DZ_Payment_Wallets {

    /** Owner's call, 2026-08-17: Bit hidden for now. Set to false to bring it back. */
    const HIDE_BIT = true;

    public function __construct() {
        add_filter('woocommerce_available_payment_gateways', [$this, 'filter_gateways'], 20);
    }

    private function ua(): string {
        return isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
    }

    /** iPhone, iPad, or a Mac running Safari -- the only places Apple Pay works. */
    private function is_apple_device(): bool {
        $ua = $this->ua();
        if (preg_match('/iPhone|iPad|iPod/i', $ua)) return true;
        // Mac + Safari, but not Chrome/Edge on a Mac (they cannot offer Apple Pay).
        if (preg_match('/Macintosh/i', $ua) && preg_match('/Safari/i', $ua)
            && !preg_match('/Chrome|Chromium|Edg\//i', $ua)) return true;
        return false;
    }

    public function filter_gateways($gateways) {
        if (is_admin() && !defined('DOING_AJAX')) return $gateways;
        if (!is_array($gateways) || !$gateways) return $gateways;

        $apple = $this->is_apple_device();

        foreach (array_keys($gateways) as $id) {
            $key = strtolower($id);

            if (self::HIDE_BIT && strpos($key, 'bit') !== false) {
                unset($gateways[$id]);
                continue;
            }
            // Keep only the wallet the device can actually complete.
            if (strpos($key, 'applepay') !== false || strpos($key, 'apple-pay') !== false) {
                if (!$apple) unset($gateways[$id]);
                continue;
            }
            if (strpos($key, 'googlepay') !== false || strpos($key, 'google-pay') !== false) {
                if ($apple) unset($gateways[$id]);
            }
        }

        // The surviving wallet goes first. WooCommerce preselects the first
        // available gateway, so this is what makes it the default without
        // hard-coding a gateway id that PayPlus could rename.
        $wallet = [];
        $rest   = [];
        foreach ($gateways as $id => $gw) {
            $key = strtolower($id);
            if (strpos($key, 'applepay') !== false || strpos($key, 'apple-pay') !== false
                || strpos($key, 'googlepay') !== false || strpos($key, 'google-pay') !== false) {
                $wallet[$id] = $gw;
            } else {
                $rest[$id] = $gw;
            }
        }
        $ordered = $wallet + $rest;

        // Ordering alone is not enough: WooCommerce only preselects the first
        // gateway when the session holds no choice, so a customer who once
        // picked cash -- or Bit, which no longer exists here -- keeps that
        // choice forever. Repair the stored choice when it is gone, and point
        // a fresh session at the wallet.
        if (function_exists('WC') && WC()->session && $ordered) {
            $chosen = WC()->session->get('chosen_payment_method');
            $seeded = WC()->session->get('alena_wallet_seeded');

            // Two cases. The stored choice is gone (Bit, for instance) -- repair
            // it. Or this session has never been seeded: point it at the wallet
            // ONCE. WooCommerce writes chosen_payment_method the moment the
            // checkout renders, so without the seed flag there is no way to
            // tell "the customer picked cash" from "cash happened to be first",
            // and a later change by the customer would be overwritten forever.
            if (!$chosen || !isset($ordered[$chosen])) {
                WC()->session->set('chosen_payment_method', array_key_first($ordered));
                WC()->session->set('alena_wallet_seeded', 1);
            } elseif (!$seeded) {
                WC()->session->set('chosen_payment_method', array_key_first($ordered));
                WC()->session->set('alena_wallet_seeded', 1);
            }
        }
        return $ordered;
    }
}
