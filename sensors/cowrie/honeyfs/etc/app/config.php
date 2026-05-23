<?php
// Application configuration
return [
    'app' => [
        'env'   => 'production',
        'debug' => false,
    ],

    'database' => [
        'primary' => [
            'host' => 'db-primary.internal',
            'port' => 3306,
            'name' => 'app_production',
            'user' => 'app_user',
        ],
        'replica' => [
            'host' => 'db-replica.internal',
            'port' => 3306,
            'name' => 'app_production',
            'user' => 'app_readonly',
        ],
    ],

    'redis' => [
        'host' => 'cache.internal',
        'port' => 6379,
        'db'   => 0,
    ],

    'intranet' => [
        'base_url' => 'http://intranet.internal',
    ],

    'fileserver' => [
        'host' => 'fileserver.internal',
        'path' => '/mnt/shared',
    ],
];
