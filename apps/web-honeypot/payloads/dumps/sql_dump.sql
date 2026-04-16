-- MySQL dump 10.19  Distrib 10.6.14-MariaDB, for debian-linux-gnu (x86_64)
-- Host: db-primary.internal    Database: techcorp_prod
-- Server version	10.6.14-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(80) NOT NULL,
  `email` varchar(200) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user','viewer') NOT NULL DEFAULT 'user',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=1847 DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `users` (first 3 rows only -- dump truncated)
--

INSERT INTO `users` VALUES
(1,'admin','admin@techcorp-solutions.com','$2y$12$LX7kQ9mN3pR8sT2vW5uYeOhGjKbMcDfIaZnElXwVsPtQrCgUoByH','admin','2023-01-15 09:23:41'),
(2,'deploy_bot','ci@techcorp-solutions.com','$2y$12$aB4cD6eF8gH0iJ2kL4mN6oP8qR0sT2uV4wX6yZ8aB0cD2eF4gH6i','viewer','2023-01-15 09:24:02'),
(3,'john.smith','j.smith@techcorp-solutions.com','$2y$12$zY8xW6vU4tS2rQ0pO8nM6lK4jI2hG0fE8dC6bA4zY2xW0vU8tS6r','user','2023-02-03 14:11:37');
