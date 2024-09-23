const express = require("express");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const path = require("path");

const uri = require('mongoose');
// mongoose.connect("mongodb://localhost:27017/demo");
uri.connect("mongodb+srv://bolaga1231:asd123@customer0.u4d8l.mongodb.net/?retryWrites=true&w=majority&appName=Customer0");
// const uri = 'mongodb://127.0.0.1:27017/Movie'; // MongoDB connection URI
const client = new MongoClient(uri);
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Use session middleware
app.use(session({
    secret: "abc",
    resave: false,
    saveUninitialized: true,
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
        res.redirect("/login");
    }
}

// Passport local strategy for admin
passport.use("admin-local", new LocalStrategy((username, password, done) => {
    if (username === "Admin" && password === "12345") {
        return done(null, { username: "Aptech" });
    }
    return done(null, false, { message: "Incorrect admin username or password" });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// User local strategy
const users = [
    { id: 1, username: "abc", password: "123" },
    { id: 2, username: "user1", password: "user" },
];

passport.use("user-local", new LocalStrategy((username, password, done) => {
    const user = users.find(u => u.username === username);
    if (!user) return done(null, false, { message: "Incorrect username." });
    if (user.password !== password) return done(null, false, { message: "Incorrect password." });
    return done(null, user);
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user);
});

async function main() {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const database = client.db();
        const collection = database.collection("MovieCollection");

        app.get("/", (req, res) => {
            res.sendFile(path.join(__dirname, "Templates/wonderland.html"));
        });

        // Admin login routes
        app.get("/views/admin-login.ejs", (req, res) => {
            res.render("admin-login");
        });

        app.post("/admin-login", passport.authenticate("admin-local", {
            successRedirect: "/admin-dashboard",
            failureRedirect: "/admin-error",
        }));

        app.get("/admin-error", (req, res) => {
            res.send('<script>alert("Incorrect Admin username or password"); window.location.href = "/";</script>');
        });

        app.get("/admin-dashboard", (req, res) => {
            res.sendFile(path.join(__dirname, "Templates/movie-list.html"));
        });

        // User login routes
        app.get("/views/login.ejs", (req, res) => {
            res.render("login");
        });

        app.post("/user-local", passport.authenticate("user-local", {
            successRedirect: "/user-dashboard",
            failureRedirect: "/user-error",
        }));

        app.get("/user-error", (req, res) => {
            res.send('<script>alert("Incorrect username or password"); window.location.href = "/";</script>');
        });

        app.get("/user-dashboard", (req, res) => {
            res.sendFile(path.join(__dirname, "Templates/book-seats-form.html"));
        });

        // Serve HTML files
        const serveTemplate = (template) => (req, res) => {
            res.sendFile(path.join(__dirname, `Templates/${template}.html`));
        };

        app.get("/add-movie-form.html", serveTemplate("add-movie-form"));
        app.get("/book-seats-form.html", serveTemplate("book-seats-form"));
        app.get("/delete-movie-form.html", serveTemplate("delete-movie-form"));
        app.get("/update-seats-form.html", serveTemplate("update-seats-form"));

        // Fetch movies
        app.get("/get-movies", async (req, res) => {
            const category = req.query.category;
            try {
                const movies = await collection.find({ Category: category }).toArray();
                res.status(200).json(movies);
            } catch (error) {
                console.error("Error fetching movies:", error);
                res.status(500).json({ error: "Failed to fetch movies" });
            }
        });

        app.get("/get-all-movies", async (req, res) => {
            try {
                const movies = await collection.find().toArray();
                res.status(200).json(movies);
            } catch (error) {
                console.error("Error fetching movies:", error);
                res.status(500).json({ error: "Failed to fetch movies" });
            }
        });

        app.get("/get-movie-details", async (req, res) => {
            const movieName = req.query.name;
            try {
                const movie = await collection.findOne({ "Movie name": movieName });
                if (movie) {
                    res.status(200).json({
                        Description: movie["Description"],
                        Actors: movie["Actors"],
                    });
                } else {
                    res.status(404).json({ error: "Movie not found" });
                }
            } catch (error) {
                console.error("Error fetching movie details:", error);
                res.status(500).json({ error: "Failed to fetch movie details" });
            }
        });

        // Add movie
        app.post("/add-movie", async (req, res) => {
            try {
                await collection.insertOne(req.body);
                res.send('<script>alert("Movie added successfully"); window.location.href = "/admin-dashboard";</script>');
            } catch (error) {
                console.error("Error adding movie:", error);
                res.status(500).send("<h2>Failed to add the movie</h2>");
            }
        });

        // Booking seats
        app.post("/book-seats", async (req, res) => {
            const isAdmin = req.isAuthenticated() && req.user.username === "Aptech";
            const movieNameToBook = req.body["Movie name"];
            const seatsToBook = parseInt(req.body["seats-to-book"]);
            try {
                const existingMovie = await collection.findOne({ "Movie name": movieNameToBook });
                if (!existingMovie) {
                    return res.send("Movie not found in the database.");
                }
                const availableSeats = existingMovie["Available Seats"];
                if (seatsToBook <= availableSeats) {
                    const updatedAvailableSeats = availableSeats - seatsToBook;
                    const result = await collection.updateOne(
                        { "Movie name": movieNameToBook },
                        { $set: { "Available Seats": updatedAvailableSeats } }
                    );
                    const redirectRoute = isAdmin ? '/admin-dashboard' : '/user-dashboard';
                    if (result.modifiedCount === 1) {
                        const alertMessage = `Booking successful for ${seatsToBook} seat(s) in ${movieNameToBook}`;
                        return res.send(`
                            <script>
                            alert("${alertMessage}");
                            window.location.href = "${redirectRoute}";
                            </script>
                        `);
                    } else {
                        return res.send(`<script>alert("Failed to update available seats"); window.location.href = "${redirectRoute}";</script>`);
                    }
                } else {
                    return res.send(`Not enough seats available for ${seatsToBook} seat(s) in ${movieNameToBook}`);
                }
            } catch (error) {
                console.error("Error booking seats:", error);
                return res.status(500).send("Failed to book seats");
            }
        });

        // Delete movie
        app.post("/delete-movie", async (req, res) => {
            const movieNameToDelete = req.body["Movie name"];
            try {
                const existingMovie = await collection.findOne({ "Movie name": movieNameToDelete });
                if (!existingMovie) {
                    return res.send("Movie not found in the database");
                }
                const result = await collection.deleteOne({ "Movie name": movieNameToDelete });
                if (result.deletedCount === 1) {
                    res.send('<script>alert("Movie deleted successfully"); window.location.href = "/admin-dashboard";</script>');
                } else {
                    res.send('<script>alert("Failed to delete the movie"); window.location.href = "/";</script>');
                }
            } catch (error) {
                console.error("Error deleting the movie:", error);
                res.status(500).send("Failed to delete the movie");
            }
        });

        // Update available seats
        app.post("/update-seats", async (req, res) => {
            const movieNameToUpdate = req.body["Movie name"];
            const newAvailableSeats = parseInt(req.body["Available Seats"]);
            try {
                const existingMovie = await collection.findOne({ "Movie name": movieNameToUpdate });
                if (!existingMovie) {
                    return res.send('<script>alert("Movie not found in the database"); window.location.href = "/";</script>');
                }
                const result = await collection.updateOne(
                    { _id: existingMovie._id },
                    { $set: { "Available Seats": newAvailableSeats } }
                );
                if (result.modifiedCount === 1) {
                    const alertMessage = `Updated available seats for ${movieNameToUpdate} successfully`;
                    res.send(`<script>alert("${alertMessage}"); window.location.href = "/admin-dashboard";</script>`);
                } else {
                    res.status(500).send("Failed to update available seats");
                }
            } catch (error) {
                console.error("Error updating available seats:", error);
                res.status(500).send("Failed to update available seats");
            }
        });

        // Logout
        app.get("/logout", (req, res) => {
            req.logout(); // Clear user session
            res.sendFile(path.join(__dirname, "Templates/wonderland.html"));
        });

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

main().catch(console.error);
app.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", () => {
    console.log("Server is running");
});
