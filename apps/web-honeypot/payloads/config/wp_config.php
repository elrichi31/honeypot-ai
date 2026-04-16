<?php
/**
 * The base configuration for WordPress
 * @package WordPress
 */

// ** Database settings ** //
define( 'DB_NAME', 'techcorp_wp_prod' );
define( 'DB_USER', 'wp_techcorp' );
define( 'DB_PASSWORD', 'techcorp-db-password-example' );
define( 'DB_HOST', 'db-primary.internal' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

$table_prefix = 'wp_';

define( 'AUTH_KEY',         'put your unique phrase here' );
define( 'SECURE_AUTH_KEY',  'put your unique phrase here' );
define( 'LOGGED_IN_KEY',    'put your unique phrase here' );
define( 'NONCE_KEY',        'put your unique phrase here' );
define( 'AUTH_SALT',        'put your unique phrase here' );
define( 'SECURE_AUTH_SALT', 'put your unique phrase here' );
define( 'LOGGED_IN_SALT',   'put your unique phrase here' );
define( 'NONCE_SALT',       'put your unique phrase here' );

define( 'WP_DEBUG', false );
define( 'WP_DEBUG_LOG', false );

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

require_once ABSPATH . 'wp-settings.php';
