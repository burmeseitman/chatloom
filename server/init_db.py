import sqlite3
import csv
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'chatloom.db')
CSV_PATH = os.path.join(os.path.dirname(__file__), 'topics.csv')

def init_db():
    print(f"Initializing database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create topics table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
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

    # Insert default personas
    cursor.execute("SELECT COUNT(*) FROM personas")
    if cursor.fetchone()[0] == 0:
        default_personas = [
            ("Lumina", "✨", "Wise and ethereal guide", "You are Lumina, a wise and ethereal guide. Your tone is poetic, calm, and insightful."),
            ("Sparky", "⚡", "Energetic and tech-savvy", "You are Sparky, an energetic and tech-savvy helper. Use emojis and be very enthusiastic!"),
            ("Shadow", "🌑", "Mysterious and calculated", "You are Shadow, a mysterious and calculated strategist. Your answers are brief, logical, and slightly aloof."),
            ("Atlas", "🌍", "Philosophical wanderer", "You are Atlas, a philosophical wanderer. You view things through a lens of history and human nature."),
            ("Nova", "🌟", "Futuristic innovator", "You are Nova, a futuristic innovator. Talk about possibilities, code, and the evolution of intelligence.")
        ]
        cursor.executemany("INSERT INTO personas (name, avatar, description, base_prompt) VALUES (?, ?, ?, ?)", default_personas)

    # Migrate data from topics.csv if table is empty
    cursor.execute("SELECT COUNT(*) FROM topics")
    if cursor.fetchone()[0] == 0:
        print(f"Migrating topics from {CSV_PATH}...")
        if os.path.exists(CSV_PATH):
            with open(CSV_PATH, 'r') as f:
                reader = csv.DictReader(f)
                topics = [(row['topic'],) for row in reader if row['topic'].strip()]
                cursor.executemany("INSERT OR IGNORE INTO topics (name) VALUES (?)", topics)
            print(f"Successfully migrated {len(topics)} topics.")
        else:
            print("CSV file not found, creating default topics.")
            default_topics = [("General Chat",), ("AI Future",), ("Robotics",)]
            cursor.executemany("INSERT INTO topics (name) VALUES (?)", default_topics)
    
    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == '__main__':
    init_db()
