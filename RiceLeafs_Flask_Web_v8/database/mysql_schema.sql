CREATE DATABASE IF NOT EXISTS riceleafs_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE riceleafs_db;

CREATE TABLE IF NOT EXISTS classification_history (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    predicted_class VARCHAR(50) NULL,
    top_class VARCHAR(50) NOT NULL,
    confidence DOUBLE NOT NULL,
    margin DOUBLE NOT NULL,
    status VARCHAR(40) NOT NULL,
    scores_json TEXT NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'gallery',
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    INDEX idx_history_top_class (top_class),
    INDEX idx_history_status (status),
    INDEX idx_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
