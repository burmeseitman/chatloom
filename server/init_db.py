import sqlite3
import csv
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chatloom.db')
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
CSV_PATH = os.path.join(os.path.dirname(__file__), 'topics.csv')

def init_db():
    print(f"Initializing database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    conn.execute('PRAGMA journal_mode = WAL')
    conn.execute('PRAGMA synchronous = NORMAL')
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA busy_timeout = 5000')

    # Drop topics to refresh with categories
    cursor.execute('DROP TABLE IF EXISTS topics')

    # Create topics table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        category TEXT DEFAULT 'General'
    )
    ''')

    # Create messages table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        avatar TEXT,
        text TEXT NOT NULL,
        msg_type TEXT DEFAULT 'chat',
        is_llm BOOLEAN DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Create personas table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS personas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL,
        description TEXT,
        base_prompt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Create settings table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL
    )
    ''')

    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        session_id TEXT PRIMARY KEY,
        nickname TEXT UNIQUE NOT NULL,
        model_name TEXT,
        hardware_mode TEXT,
        persona_id INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (persona_id) REFERENCES personas(id)
    )
    ''')

    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_room_id_id ON messages(room_id, id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_topics_category_name ON topics(category, name)')

    # Insert default settings
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        default_settings = [
            ("system_intro", "You are {name}. Stay in character."),
            ("system_participate", "You are {name}. Stay in character."),
            ("prompt_wrapper", "{last_message}")
        ]
        cursor.executemany("INSERT INTO settings (key, value) VALUES (?, ?)", default_settings)

    # Insert default personas
    cursor.execute("SELECT COUNT(*) FROM personas")
    if cursor.fetchone()[0] == 0:
        default_personas = [
            ("Lumina", "✨", "Wise and ethereal guide", "You are Lumina..."),
            ("Sparky", "⚡", "Energetic helper", "You are Sparky..."),
            ("Shadow", "🌑", "Mysterious strategist", "You are Shadow..."),
            ("Atlas", "🌍", "Philosophical wanderer", "You are Atlas..."),
            ("Nova", "🌟", "Futuristic innovator", "You are Nova...")
        ]
        cursor.executemany("INSERT INTO personas (name, avatar, description, base_prompt) VALUES (?, ?, ?, ?)", default_personas)

    # Heuristic for categorization
    def classify(name):
        n = name.lower()
        if any(x in n for x in ['ai', 'intellig', 'llm', 'neur', 'swarm']): return 'AI'
        if any(x in n for x in ['code', 'dev', 'rust', 'py', 'script', 'web', 'hardw', 'tech', 'comput']): return 'Tech'
        if any(x in n for x in ['game', 'esport', 'zelda', 'play', 'final fantasy']): return 'Gaming'
        if any(x in n for x in ['sci', 'bio', 'physic', 'quantum', 'space', 'astro']): return 'Science'
        if any(x in n for x in ['art', 'music', 'design', 'creat', 'write', 'photo']): return 'Creative'
        return 'General'

    # Sync topics from CSV
    if os.path.exists(CSV_PATH):
        with open(CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            topics_data = []
            for row in reader:
                name = row['topic'].strip()
                if name:
                    topics_data.append((name, classify(name)))
            cursor.executemany("INSERT OR IGNORE INTO topics (name, category) VALUES (?, ?)", topics_data)
        print(f"Synchronized {len(topics_data)} topics.")

    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == '__main__':
    init_db()
