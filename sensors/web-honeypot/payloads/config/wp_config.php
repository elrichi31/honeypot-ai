<?php
/**
 * The base configuration for WordPress
 * @package WordPress
 */

// ** Database settings ** //
define( 'DB_NAME', 'techcorp_wp_prod' );
define( 'DB_USER', 'wp_techcorp' );
define( 'DB_PASSWORD', 'Tc0rp!db_Pr0d_2024' );
define( 'DB_HOST', 'db-primary.internal' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

$table_prefix = 'wp_';

define( 'AUTH_KEY',         'k9Hm2P|vQ7x&R4t-Y8w#N6z!L3j^F1c@B5d*A0sE+gI2k.M4n' );
define( 'SECURE_AUTH_KEY',  'O7p9R2t4V6w8X0z2B4d6F8h0J2l4N6p8R0t2V4w6X8z0B2d4' );
define( 'LOGGED_IN_KEY',    'F1c3B5d7A9s1E3g5I7k9M1n3O5p7R9t1V3w5X7z9B1d3F5h7' );
define( 'NONCE_KEY',        'z2B4d6F8h0J2l4N6p8R0t2V4w6X8z0B2d4F6h8J0l2N4p6R8' );
define( 'AUTH_SALT',        'm4N6p8R0t2V4w6X8z0B2d4F6h8J0l2N4p6R8t0V2w4X6z8B0' );
define( 'SECURE_AUTH_SALT', 'h8J0l2N4p6R8t0V2w4X6z8B0d2F4h6J8l0N2p4R6t8V0w2X4' );
define( 'LOGGED_IN_SALT',   'd6F8h0J2l4N6p8R0t2V4w6X8z0B2d4F6h8J0l2N4p6R8t0V2' );
define( 'NONCE_SALT',       'B0d2F4h6J8l0N2p4R6t8V0w2X4z6B8d0F2h4J6l8N0p2R4t6' );

define( 'WP_DEBUG', false );
define( 'WP_DEBUG_LOG', false );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

require_once ABSPATH . 'wp-settings.php';
