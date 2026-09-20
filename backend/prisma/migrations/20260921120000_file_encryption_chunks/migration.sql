-- File-at-rest encryption + multi-account chunk splitting

ALTER TABLE `files` ADD COLUMN `encrypted` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `files` ADD COLUMN `chunk_count` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `file_chunks` (
  `id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `chunk_index` INTEGER NOT NULL,
  `connected_account_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `provider_file_id` VARCHAR(191) NOT NULL,
  `plain_bytes` BIGINT NOT NULL,
  `cipher_bytes` BIGINT NOT NULL,
  `iv` VARCHAR(64) NOT NULL,
  `auth_tag` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `file_chunks_file_id_chunk_index_key`(`file_id`, `chunk_index`),
  INDEX `file_chunks_file_id_idx`(`file_id`),
  INDEX `file_chunks_connected_account_id_idx`(`connected_account_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `file_chunks` ADD CONSTRAINT `file_chunks_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `file_chunks` ADD CONSTRAINT `file_chunks_connected_account_id_fkey` FOREIGN KEY (`connected_account_id`) REFERENCES `connected_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
