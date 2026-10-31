
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Allow JSON requests
app.use(express.json());

// Connect to Supabase PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true
    }
});

// Serve the public website
app.use(express.static(path.join(__dirname, "public")));

// Homepage
app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// Check server status
app.get("/api/health", (req, res) => {
    res.json({
        status: "success",
        message: "CareerPath Finder server is running!"
    });
});

// Retrieve all careers from Supabase
app.get("/api/careers", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM public.careers ORDER BY id ASC"
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Database error details:", {
    message: error.message,
    code: error.code,
    cause: error.cause?.message
});

        res.status(500).json({
            error: "Unable to retrieve career information."
        });
    }
});


const allowedAnswers = {
    grade_level: ["Middle School", "High School", "College"],
    favorite_subject: [
        "Science", "Mathematics", "English", "History",
        "Technology", "Art", "Physical Education"
    ],
    career_interest: [
        "Education", "Healthcare", "Technology",
        "Public Safety", "Business", "Skilled Trades"
    ],
    work_activity: [
        "Helping Others", "Working with Technology",
        "Building or Fixing Things", "Leading or Managing People",
        "Solving Problems", "Creative Activities"
    ],
    personal_strength: [
        "Communication", "Leadership", "Creativity",
        "Problem Solving", "Teamwork", "Technical Skills"
    ],
    educational_goal: [
        "High School Diploma", "Trade School",
        "Community College", "Four-Year College",
        "Graduate School"
    ]
};

app.post("/api/questionnaire", async (req, res) => {
    try {
        const answers = req.body;

        if (!answers || typeof answers !== "object" ||
            Array.isArray(answers)) {
            return res.status(400).json({
                error: "Please submit a valid questionnaire."
            });
        }

        for (const [field, options] of Object.entries(allowedAnswers)) {
            if (!options.includes(answers[field])) {
                return res.status(400).json({
                    error: `Please select a valid ${field.replaceAll("_", " ")}.`
                });
            }
        }

        const studentName = answers.student_name ?? "";
        const additionalInterests = answers.additional_interests ?? "";

        if (
            typeof studentName !== "string" ||
            studentName.length > 50 ||
            typeof additionalInterests !== "string" ||
            additionalInterests.length > 250
        ) {
            return res.status(400).json({
                error: "Please check the optional text fields."
            });
        }

        const result = await pool.query(
            `INSERT INTO public.student_responses
            (
                student_name,
                grade_level,
                favorite_subject,
                career_interest,
                work_activity,
                personal_strength,
                educational_goal,
                additional_interests
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING access_token`,
            [
                studentName.trim() || null,
                answers.grade_level,
                answers.favorite_subject,
                answers.career_interest,
                answers.work_activity,
                answers.personal_strength,
                answers.educational_goal,
                additionalInterests.trim() || null
            ]
        );

        res.status(201).json({
            message: "Questionnaire saved successfully!",
            accessToken: result.rows[0].access_token
        });

    } catch (error) {
        console.error("Questionnaire database error:", {
            message: error.message,
            code: error.code
        });

        res.status(500).json({
            error: "Unable to save questionnaire. Please try again."
        });
    }
});

const careerRules = {
    Education: {
        subjects: ["English", "History", "Art"],
        activities: ["Helping Others", "Creative Activities"],
        strengths: ["Communication", "Creativity"]
    },
    Healthcare: {
        subjects: ["Science", "Physical Education"],
        activities: ["Helping Others", "Solving Problems"],
        strengths: ["Communication", "Problem Solving", "Teamwork"]
    },
    Technology: {
        subjects: ["Technology", "Mathematics"],
        activities: ["Working with Technology", "Solving Problems"],
        strengths: ["Technical Skills", "Problem Solving"]
    },
    "Public Safety": {
        subjects: ["Physical Education", "Science"],
        activities: ["Helping Others", "Solving Problems"],
        strengths: ["Teamwork", "Leadership"]
    },
    Business: {
        subjects: ["Mathematics", "English"],
        activities: ["Leading or Managing People", "Solving Problems"],
        strengths: ["Leadership", "Communication"]
    },
    "Skilled Trades": {
        subjects: ["Mathematics", "Technology"],
        activities: ["Building or Fixing Things", "Solving Problems"],
        strengths: ["Technical Skills", "Problem Solving"]
    }
};

// Get career recommendations for one questionnaire submission
app.get("/api/results/:token", async (req, res) => {
    try {
        
const token = req.params.token;

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return res.status(400).json({
        error: "Invalid questionnaire access token."
    });
}

        const responseResult = await pool.query(
    `SELECT id, career_interest, favorite_subject,
            work_activity, personal_strength
     FROM public.student_responses
     WHERE access_token = $1`,
    [token]
);

        if (responseResult.rows.length === 0) {
            return res.status(404).json({
                error: "Questionnaire not found."
            });
        }

        const answers = responseResult.rows[0];

        const careerResult = await pool.query(
            `SELECT id, career_name, category, description,
                    education_required, skills
             FROM public.careers`
        );

        const matches = careerResult.rows.map((career) => {
            const rules = careerRules[career.category];

            let score = 0;
            const reasons = [];

            if (career.category === answers.career_interest) {
                score += 5;
                reasons.push("Matches your career interest");
            }

            if (rules?.subjects.includes(answers.favorite_subject)) {
                score += 2;
                reasons.push("Matches your favorite subject");
            }

            if (rules?.activities.includes(answers.work_activity)) {
                score += 2;
                reasons.push("Matches your preferred work activity");
            }

            if (rules?.strengths.includes(answers.personal_strength)) {
                score += 2;
                reasons.push("Matches your personal strength");
            }

            return {
                ...career,
                score,
                reasons
            };
        });

        matches.sort((a, b) =>
            b.score - a.score ||
            a.career_name.localeCompare(b.career_name)
        );

        res.json({
            submissionId: answers.id,
            recommendations: matches.slice(0, 3)
        });

    } catch (error) {
        console.error("Career matching error:", {
            message: error.message,
            code: error.code
        });

        res.status(500).json({
            error: "Unable to generate career recommendations."
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(
        `CareerPath Finder server running on port ${PORT}`
    );
});
