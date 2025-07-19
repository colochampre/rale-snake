import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('/data/rale_snake.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

export const initDb = () => {
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

export const findOrCreatePlayer = (username) => {
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

export const getTotalXpForLevel = (level) => {
    return 100 * Math.pow(level, 2) + 200 * level - 300; // 500, 1200, 2100, 3200, 4500, 6000, 7700, 9600, 11700
};

export const getXpToNextLevel = (level) => {
    const xpCurrentLevel = getTotalXpForLevel(level);
    const xpNextLevel = getTotalXpForLevel(level + 1);
    return xpNextLevel - xpCurrentLevel;
};

export const getPlayerStats = (username) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM players WHERE username = ?`;
        db.get(query, [username], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

export const saveGameStats = (gameData, duration) => {
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            const run = (sql, params = []) => new Promise((res, rej) => {
                db.run(sql, params, function(err) {
                    if (err) return rej(err);
                    res(this);
                });
            });

            const get = (sql, params = []) => new Promise((res, rej) => {
                db.get(sql, params, (err, row) => {
                    if (err) return rej(err);
                    res(row);
                });
            });

            try {
                await run('BEGIN TRANSACTION');

                const matchResult = await run(
                    'INSERT INTO matches (winner_team, score_team1, score_team2, duration) VALUES (?, ?, ?, ?)',
                    [gameData.winner, gameData.score.team1, gameData.score.team2, duration]
                );
                const matchId = matchResult.lastID;

                const playerUpdatePromises = Object.keys(gameData.players).map(async (socketId) => {
                    const playerInfo = gameData.players[socketId];
                    const playerMatchStats = gameData.playerMatchStats[socketId];

                    if (!playerInfo || !playerMatchStats) return;

                    const player = await get('SELECT id FROM players WHERE username = ?', [playerInfo.username]);
                    if (!player) throw new Error(`Player not found in DB: ${playerInfo.username}`);
                    const playerId = player.id;

                    await run(
                        'INSERT INTO player_match_stats (player_id, match_id, goals, assists, touches) VALUES (?, ?, ?, ?, ?)',
                        [playerId, matchId, playerMatchStats.goals, playerMatchStats.assists, playerMatchStats.touches]
                    );

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

                    const xpGained = (playerMatchStats.goals * 100) + (playerMatchStats.assists * 50) + (playerMatchStats.touches * 1) + (winIncrement * 100);
                    
                    let playerState = await get('SELECT level, experience FROM players WHERE id = ?', [playerId]);

                    let currentXp = playerState.experience + xpGained;
                    let currentLevel = playerState.level;
                    let xpForNextLevel = getXpToNextLevel(currentLevel);

                    while (currentXp >= xpForNextLevel) {
                        currentLevel++;
                        currentXp -= xpForNextLevel;
                        xpForNextLevel = getXpToNextLevel(currentLevel);
                    }

                    await run('UPDATE players SET level = ?, experience = ? WHERE id = ?', [currentLevel, currentXp, playerId]);
                });

                await Promise.all(playerUpdatePromises);

                await run('COMMIT');
                console.log(`Game stats for match ${matchId} saved successfully.`);
                resolve();

            } catch (error) {
                console.error('Rolling back transaction due to error:', error);
                await new Promise(res => db.run('ROLLBACK', res));
                reject(error);
            }
        });
    });
};

export const getGlobalRanking = (sortBy = 'results') => {
    return new Promise((resolve, reject) => {
        let orderByClause;

        if (sortBy === 'performance') {
            orderByClause = 'ORDER BY total_goals DESC, total_assists DESC, level DESC';
        } else { // 'results'
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

export { db };
