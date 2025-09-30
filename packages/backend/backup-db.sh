#!/bin/bash

# Script de backup do banco de dados SQLite
# Uso: ./backup-db.sh

DB_FILE="jarvi.db"
BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/jarvi_backup_${TIMESTAMP}.db"

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Fazer backup se o banco existir
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_FILE"
    echo "✅ Backup criado: $BACKUP_FILE"
    
    # Manter apenas os 10 backups mais recentes
    ls -t "$BACKUP_DIR"/jarvi_backup_*.db | tail -n +11 | xargs -r rm
    echo "🧹 Backups antigos removidos (mantidos 10 mais recentes)"
else
    echo "⚠️  Arquivo $DB_FILE não encontrado"
fi
