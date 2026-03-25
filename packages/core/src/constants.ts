export const VASP_VERSION = '0.5.0'

export const VASP_FILE_EXTENSION = '.vasp'
export const VASP_ENTRY_FILE = 'main.vasp'
export const VASP_GEN_DIR = '.vasp-gen'

export const SUPPORTED_AUTH_METHODS = ['usernameAndPassword', 'google', 'github'] as const
export const SUPPORTED_CRUD_OPERATIONS = ['list', 'create', 'update', 'delete'] as const
export const SUPPORTED_REALTIME_EVENTS = ['created', 'updated', 'deleted'] as const
export const SUPPORTED_JOB_EXECUTORS = ['PgBoss'] as const
export const SUPPORTED_FIELD_TYPES = ['String', 'Int', 'Boolean', 'DateTime', 'Float'] as const

export const DEFAULT_BACKEND_PORT = 3001
export const DEFAULT_SPA_PORT = 5173
export const DEFAULT_SSR_PORT = 3000
