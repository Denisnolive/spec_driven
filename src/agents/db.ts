import { Sequelize, DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { BetterSqliteShim } from './sqlite-shim.js';

// ─── Instância Sequelize ──────────────────────────────────────────────────────
// Padrão: SQLite in-memory (store mock isolado, sem servidor).
// Sobrescreva DB_STORAGE para um path de arquivo SQLite persistente.

const storage: string = process.env.DB_STORAGE ?? ':memory:';

export const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  dialectModule: BetterSqliteShim,
  logging: false,
  // Limit pool to 1 connection — the shim shares a single better-sqlite3 instance.
  // idle:0 ensures pool timers don't keep the event loop alive after tests.
  pool: { max: 1, min: 0, acquire: 30000, idle: 0 },
});

// ─── Modelo: Service ──────────────────────────────────────────────────────────

export class Service extends Model<
  InferAttributes<Service>,
  InferCreationAttributes<Service>
> {
  declare id: CreationOptional<number>;
  declare name: string;
}

Service.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
  },
  { sequelize, tableName: 'services', timestamps: false }
);

// ─── Modelo: Alert ────────────────────────────────────────────────────────────

export class Alert extends Model<
  InferAttributes<Alert>,
  InferCreationAttributes<Alert>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare service: string;
  declare severity: string;
  declare status: string; // 'firing' | 'resolved'
}

Alert.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    service: { type: DataTypes.STRING, allowNull: false },
    severity: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'firing' },
  },
  { sequelize, tableName: 'alerts', timestamps: false }
);

// ─── Modelo: Incident ─────────────────────────────────────────────────────────

export class Incident extends Model<
  InferAttributes<Incident>,
  InferCreationAttributes<Incident>
> {
  declare id: CreationOptional<number>;
  declare title: string;
  declare service: string;
  declare severity: string;
  declare status: CreationOptional<string>;
}

Incident.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    service: { type: DataTypes.STRING, allowNull: false },
    severity: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'open' },
  },
  { sequelize, tableName: 'incidents', timestamps: false }
);

// ─── Inicialização ────────────────────────────────────────────────────────────

export interface InitDbOptions {
  /** Dropa e recria as tabelas (útil em testes). Padrão: false. */
  force?: boolean;
}

export async function initDb(options: InitDbOptions = {}): Promise<void> {
  await sequelize.sync({ force: options.force ?? false });
}
