const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./rale_snake.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

const initDb = () => {
    const createPlayersTable = `
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            level INTEGER DEFAULT 1,
            experience INTEGER DEFAULT 0,
            total_goals INTEGER DEFAULT 0,
            total_assists INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            total_matches INTEGER DEFAULT 0
        );
    `;

    const createMatchesTable = `
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            winner_team TEXT,
            score_team1 INTEGER,
            score_team2 INTEGER,
            duration INTEGER,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    const createPlayerMatchStatsTable = `
        CREATE TABLE IF NOT EXISTS player_match_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER,
            match_id INTEGER,
            goals INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            touches INTEGER DEFAULT 0,
            FOREIGN KEY (player_id) REFERENCES players (id),
            FOREIGN KEY (match_id) REFERENCES matches (id)
        );
    `;

    db.serialize(() => {
        db.run(createPlayersTable);
        db.run(createMatchesTable);
        db.run(createPlayerMatchStatsTable, (err) => {
            if (err) {
                console.error('Error creating tables', err.message);
            } else {
                console.log('Tables created or already exist.');
            }
        });
    });
};

const findOrCreatePlayer = (username) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM players WHERE username = ?`;
        db.get(query, [username], (err, row) => {
            if (err) return reject(err);
            if (row) {
                resolve(row);
            } else {
                const insert = `INSERT INTO players (username) VALUES (?)`;
                db.run(insert, [username], function(err) {
                    if (err) return reject(err);
                    db.get(query, [username], (err, newRow) => {
                        if (err) return reject(err);
                        resolve(newRow);
                    });
                });
            }
        });
    });
};

const getTotalXpForLevel = (level) => {
    return 100 * Math.pow(level, 2) + 200 * level - 300; // 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 11700
};

const getXpToNextLevel = (level) => {
    const xpCurrentLevel = getTotalXpForLevel(level);
    const xpNextLevel = getTotalXpForLevel(level + 1);
    return xpNextLevel - xpCurrentLevel;
};

const getPlayerStats = (username) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM players WHERE username = ?`;
        db.get(query, [username], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

const saveGameStats = (gameData, duration) => {
    return new Promise((resolve, reject) => {
        // Use serialize to ensure statements run in order, and manually handle transactions.
        db.serialize(async () => {
            // Helper to run a statement and return a promise
            const run = (sql, params = []) => new Promise((res, rej) => {
                db.run(sql, params, function(err) {
                    if (err) return rej(err);
                    res(this);
                });
            });

            // Helper to get a row and return a promise
            const get = (sql, params = []) => new Promise((res, rej) => {
                db.get(sql, params, (err, row) => {
                    if (err) return rej(err);
                    res(row);
                });
            });

            try {
                await run('BEGIN TRANSACTION');

                // 1. Insert match record
                const matchResult = await run(
                    'INSERT INTO matches (winner_team, score_team1, score_team2, duration) VALUES (?, ?, ?, ?)',
                    [gameData.winner, gameData.score.team1, gameData.score.team2, duration]
                );
                const matchId = matchResult.lastID;

                // Create a list of promises for all player updates
                const playerUpdatePromises = Object.keys(gameData.players).map(async (socketId) => {
                    const playerInfo = gameData.players[socketId];
                    const playerMatchStats = gameData.playerMatchStats[socketId];

                    if (!playerInfo || !playerMatchStats) return; // Skip if data is missing

                    // Get player DB ID from username
                    const player = await get('SELECT id FROM players WHERE username = ?', [playerInfo.username]);
                    if (!player) throw new Error(`Player not found in DB: ${playerInfo.username}`);
                    const playerId = player.id;

                    // Insert detailed stats for this match
                    await run(
                        'INSERT INTO player_match_stats (player_id, match_id, goals, assists, touches) VALUES (?, ?, ?, ?, ?)',
                        [playerId, matchId, playerMatchStats.goals, playerMatchStats.assists, playerMatchStats.touches]
                    );

                    // Update player's global stats
                    const isWinner = gameData.winner === playerInfo.team;
                    const isDraw = gameData.winner === 'draw';
                    const winIncrement = isWinner ? 1 : 0;
                    const lossIncrement = !isWinner && !isDraw ? 1 : 0;
                    const drawIncrement = isDraw ? 1 : 0;

                    const playerUpdateSql = `
                        UPDATE players 
                        SET 
                            total_goals = total_goals + ?, 
                            total_assists = total_assists + ?, 
                            wins = wins + ?, 
                            losses = losses + ?, 
                            draws = draws + ?, 
                            total_matches = total_matches + 1
                        WHERE username = ?`;

                    await run(playerUpdateSql, [playerMatchStats.goals, playerMatchStats.assists, winIncrement, lossIncrement, drawIncrement, playerInfo.username]);

                    // XP and Leveling up logic
                    const xpGained = (playerMatchStats.goals * 100) + (playerMatchStats.assists * 50) + (playerMatchStats.touches * 1) + (winIncrement * 100);
                    
                    // Get current player state from DB
                    let playerState = await get('SELECT level, experience FROM players WHERE id = ?', [playerId]);

                    let currentXp = playerState.experience + xpGained;
                    let currentLevel = playerState.level;
                    let xpForNextLevel = getXpToNextLevel(currentLevel);

                    // Loop to handle multiple level-ups
                    while (currentXp >= xpForNextLevel) {
                        currentLevel++;
                        currentXp -= xpForNextLevel;
                        xpForNextLevel = getXpToNextLevel(currentLevel);
                    }

                    // Update player's level and experience
                    await run('UPDATE players SET level = ?, experience = ? WHERE id = ?', [currentLevel, currentXp, playerId]);
                });

                // Wait for all player updates to complete
                await Promise.all(playerUpdatePromises);

                // Commit the transaction
                await run('COMMIT');
                console.log(`Game stats for match ${matchId} saved successfully.`);
                resolve();

            } catch (error) {
                console.error('Rolling back transaction due to error:', error);
                // Attempt to rollback
                await new Promise(res => db.run('ROLLBACK', res));
                reject(error);
            }
        });
    });
};

const getGlobalRanking = (sortBy = 'results') => {
    return new Promise((resolve, reject) => {
        let orderByClause;

        if (sortBy === 'performance') {
            // Ordena por goles, luego asistencias, luego nivel
            orderByClause = 'ORDER BY total_goals DESC, total_assists DESC, level DESC';
        } else { // 'results'
            // Ordena usando el límite inferior del intervalo de confianza de Wilson.
            // Esto proporciona un ranking más justo que balancea el winrate con el número de partidas.
            // 'z' es 1.96 para un intervalo de confianza del 95%.
            const z = 1.96;
            orderByClause = `
                ORDER BY (
                    (CAST(wins AS REAL) / total_matches + (${z}*${z}) / (2 * total_matches)) - 
                    ${z} * SQRT(
                        ( (CAST(wins AS REAL) / total_matches) * (1 - (CAST(wins AS REAL) / total_matches)) + (${z}*${z}) / (4 * total_matches) ) / total_matches
                    )
                ) / (1 + (${z}*${z}) / total_matches) DESC
            `;
        }

        const query = `
            SELECT username, level, wins, losses, draws, total_matches, total_goals, total_assists 
            FROM players 
            WHERE total_matches > 0
            ${orderByClause}
            LIMIT 100
        `;
        
        db.all(query, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

module.exports = {
    db,
    initDb,
    findOrCreatePlayer,
    getPlayerStats,
    saveGameStats,
    getGlobalRanking,
    getXpToNextLevel
};
