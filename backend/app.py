import os
import google.generativeai as genai
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from flask import Flask, jsonify, request, Response # Added 'request'
from flask_cors import CORS
from dotenv import load_dotenv
import json
import re
from flask import send_file # For sending the file response
import io
import traceback
from xhtml2pdf import pisa
from markdown import markdown
from markdown_it import MarkdownIt
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime # For date handling if needed, though strings are simpler for DB
from flask_jwt_extended import create_access_token, jwt_required, JWTManager, get_jwt_identity
from flask_bcrypt import Bcrypt

# Initialize Flask app
app = Flask(__name__)
CORS(
    app,
    # Try a pattern that explicitly matches multiple path segments
    resources={r"/api/.*": { # Use ".*" regex for zero or more characters
        "origins": ["http://localhost:5173"]
        }
    },
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    supports_credentials=True
)
# CORS(app)
# Load environment variables from .env file
load_dotenv()

# --- API Key Configuration ---
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
YOUTUBE_API_KEY = os.getenv('YOUTUBE_API_KEY')

if not GEMINI_API_KEY:
    raise ValueError("Missing Gemini API Key in .env file")
if not YOUTUBE_API_KEY:
    raise ValueError("Missing YouTube API Key in .env file")

# --- Initialize Services ---
# Configure Gemini client
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-flash') # Or 'gemini-pro'

# Function to build YouTube service (avoids building it globally)
def get_youtube_service():
    return build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)


# --- Database Configuration ---
# Define the base directory of the backend folder
basedir = os.path.abspath(os.path.dirname(__file__))
# Configure the SQLite database URI
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'study_plan.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False # Disable modification tracking overhead

# Initialize SQLAlchemy with the Flask app
db = SQLAlchemy(app)

# --- Initialize Extensions ---
bcrypt = Bcrypt(app) # For password hashing
jwt = JWTManager(app) # For JWT handling

# --- Configure JWT ---
# You MUST set a secret key for JWT. Use a strong, random secret in production.
# For local dev, you can use a simple one, but keep it secret.
# Store it in your .env file for better practice.
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "your-super-secret-jwt-key-change-me") # Add JWT_SECRET_KEY to your .env
# Configure token expiration time (optional, default is 15 minutes)
# app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=1)

# --- Define Database Models ---

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False) # Store hashed password

    # Relationship to saved sessions (one-to-many)
    # 'lazy=True' means sessions are loaded only when accessed
    # 'cascade="all, delete-orphan"' means deleting a user deletes their sessions
    sessions = db.relationship('SavedSession', backref='user', lazy=True, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<User {self.username}>'


# --- NEW: SavedSession Model ---
class SavedSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topic = db.Column(db.String(200), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    summary = db.Column(db.Text, nullable=True)
    youtube_videos = db.Column(db.Text, nullable=True) # Store as JSON string
    quiz_questions = db.Column(db.Text, nullable=True) # Store as JSON string
    flashcards = db.Column(db.Text, nullable=True) # Store as JSON string
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Foreign Key to link to the User model
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def __repr__(self):
        return f'<SavedSession {self.id}: {self.topic} by User {self.user_id}>'

# --- Update Database Creation ---
with app.app_context():
    print("Checking/Creating database tables...")
    db.create_all() # This will now create User, StudyPlanEntry, and SavedSession if they don't exist
    print("Database tables checked/created.")

# --- Define Database Model ---
class StudyPlanEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topic = db.Column(db.String(200), nullable=False)
    review_date = db.Column(db.String(10), nullable=False) # Store date as YYYY-MM-DD string
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def __repr__(self):
        return f'<StudyPlanEntry {self.id}: {self.topic} on {self.review_date}>'

# --- Create Database Tables (Run Once) ---
# This context ensures the app context is available for db operations
with app.app_context():
    # Check if the database file exists, if not create tables
    # A more robust approach might use Flask-Migrate, but this is simpler for local dev
    if not os.path.exists(os.path.join(basedir, 'study_plan.db')):
         print("Database not found, creating tables...")
         db.create_all()
         print("Database tables created.")
    else:
         # Ensure tables exist even if file exists (e.g., if model changed)
         # This won't hurt if tables are already there
         db.create_all()
         print("Database tables checked/ensured.")

# --- End Database Configuration ---

# --- Helper Functions ---
def generate_gemini_content(prompt_text):
    """Calls the Gemini API and handles potential errors."""
    try:
        response = gemini_model.generate_content(prompt_text)
        # Handling potential safety blocks or empty responses
        if response.parts:
             return response.text
        else:
             # If response.parts is empty, check prompt_feedback for block reason
             if response.prompt_feedback.block_reason:
                 return f"Content generation blocked: {response.prompt_feedback.block_reason}"
             else:
                 return "Error: Received empty response from AI."
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return f"Error generating content: {e}" # Return error message

def search_youtube(query, max_results=5):
    """Searches YouTube and returns a list of video details."""
    try:
        youtube = get_youtube_service()
        search_response = youtube.search().list(
            q=query,
            part='snippet',
            maxResults=max_results,
            type='video'
        ).execute()

        videos = []
        for search_result in search_response.get('items', []):
            video_id = search_result['id']['videoId']
            title = search_result['snippet']['title']
            thumbnail = search_result['snippet']['thumbnails']['medium']['url'] # medium quality thumbnail
            video_url = f'https://www.youtube.com/watch?v={video_id}'
            videos.append({
                'title': title,
                'thumbnail': thumbnail,
                'url': video_url,
                'id': video_id # Include id if needed later
            })
        return videos
    except HttpError as e:
        print(f"YouTube API Error: {e}")
        return [] # Return empty list on error
    except Exception as e:
        print(f"An error occurred with YouTube search: {e}")
        return [] # Return empty list on other errors


def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.md = MarkdownIt()
        self.current_style = ''
        try:
            font_path = os.path.join(os.path.dirname(__file__), 'fonts')
            self.add_font('DejaVu', '', os.path.join(font_path, 'DejaVuSans.ttf'), uni=True)
            self.add_font('DejaVu', 'B', os.path.join(font_path, 'DejaVuSans-Bold.ttf'), uni=True)
            self.add_font('DejaVu', 'I', os.path.join(font_path, 'DejaVuSans-Italic.ttf'), uni=True)
            self.set_font('DejaVu', '', 12)
            self.default_font = 'DejaVu'
            print("Successfully added DejaVu fonts.")
        except Exception as e:
            print(f"!!! Font Error: {e}. Could not load DejaVu fonts. Falling back to Arial.")
            self.set_font('Arial', '', 12)
            self.default_font = 'Arial'

def header(self):
        self.set_font(self.default_font, 'B', 15)
        title_w = self.get_string_width(self.title) + 6
        doc_w = self.w
        self.set_x((doc_w - title_w) / 2)
        self.cell(title_w, 10, self.title, border=0, ln=1, align='C')
        self.ln(10)
        self.set_font(self.default_font, '', 12)

def footer(self):
        self.set_y(-15)
        self.set_font(self.default_font, 'I', 8)
        self.set_text_color(128)
        self.cell(0, 10, 'Page ' + str(self.page_no()), 0, 0, 'C')
        self.set_text_color(0)

def set_font_style(self, style, size=12):
        self.set_font(self.default_font, style, size)
        self.current_style = style

def chapter_title(self, title):
        self.set_font_style('B', 14)
        self.cell(0, 6, title, 0, 1, 'L')
        self.ln(4)

def chapter_body(self, markdown_text):
        try:
            decoded_text = markdown_text.encode('latin-1', 'replace').decode('latin-1')
        except AttributeError:
            decoded_text = markdown_text

        tokens = self.md.parse(decoded_text)
        self.set_font_style('', 12)

        for token in tokens:
            if token.type == 'paragraph_open':
                pass
            elif token.type == 'paragraph_close':
                self.ln(2)
            elif token.type == 'inline':
                current_text = ''
                start_x = self.get_x()
                for child in token.children:
                    if child.type == 'text':
                        current_text += child.content
                    elif child.type == 'strong_open':
                        if current_text:
                            self.write_text(current_text)
                            current_text = ''
                        self.set_font_style('B', 12)
                    elif child.type == 'strong_close':
                        if current_text:
                            self.write_text(current_text)
                            current_text = ''
                        self.set_font_style('', 12)
                    elif child.type == 'em_open':
                        if current_text:
                            self.write_text(current_text)
                            current_text = ''
                        self.set_font_style('I', 12)
                    elif child.type == 'em_close':
                        if current_text:
                            self.write_text(current_text)
                            current_text = ''
                        self.set_font_style('', 12)
                if current_text:
                    self.write_text(current_text)
            elif token.type == 'heading_open' and token.tag == 'h2':
                self.ln(4)
                self.set_font_style('B', 14)
            elif token.type == 'heading_close' and token.tag == 'h2':
                self.set_font_style('', 12)
                self.ln(2)

def write_text(self, text):
        try:
            # Dynamic line height based on font size
            line_height = self.font_size_pt * 1.2 / self.k  # pt to mm
            self.write(line_height, text)
        except Exception as e:
            print(f"Error writing text chunk: {e}")
            self.write(5, "[Write Error]")

def add_quiz_question(self, index, q_data):
        available_width = self.w - self.l_margin - self.r_margin

        self.set_font_style('B', 12)
        question_text = q_data.get('question', 'N/A')
        self.multi_cell(available_width, 5, f"{index + 1}. {question_text}")
        self.ln(1)

        self.set_font_style('', 11)
        options = q_data.get('options', [])
        correct_answer = q_data.get('correct_answer', '')
        option_indent = 5
        option_prefix_width = 5

        for option in options:
            prefix = " " * 4
            if option == correct_answer:
                prefix += "✓ "
            else:
                prefix += "  "

            self.cell(option_indent + option_prefix_width, 5, prefix)
            self.multi_cell(available_width - (option_indent + option_prefix_width), 5, option)

        self.set_font_style('I', 10)
        explanation_text = q_data.get('explanation', 'N/A')
        self.set_x(self.l_margin + option_indent)
        self.multi_cell(available_width - option_indent, 5, f"Explanation: {explanation_text}")
        self.set_x(self.l_margin)
        self.ln(4)

# --- Authentication API Routes ---

@app.route('/api/register', methods=['POST'])
def register():
    if not request.is_json:
        return jsonify({"msg": "Missing JSON in request"}), 400

    username = request.json.get('username', None)
    password = request.json.get('password', None)

    if not username or not password:
        return jsonify({"msg": "Missing username or password"}), 400

    # Check if user already exists
    user_exists = User.query.filter_by(username=username).first()
    if user_exists:
        return jsonify({"msg": "Username already exists"}), 409 # 409 Conflict

    # Hash the password using Bcrypt
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

    # Create new user
    new_user = User(username=username, password_hash=hashed_password)
    try:
        db.session.add(new_user)
        db.session.commit()
        print(f"User registered: {username}")
        # Optionally log the user in immediately by creating a token
        # access_token = create_access_token(identity=new_user.id)
        # return jsonify(access_token=access_token), 201
        return jsonify({"msg": "User registered successfully"}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error registering user: {e}")
        return jsonify({"msg": f"Registration failed: {str(e)}"}), 500


@app.route('/api/login', methods=['POST'])
def login():
    if not request.is_json:
        return jsonify({"msg": "Missing JSON in request"}), 400

    username = request.json.get('username', None)
    password = request.json.get('password', None)

    if not username or not password:
        return jsonify({"msg": "Missing username or password"}), 400

    # Find user
    user = User.query.filter_by(username=username).first()

    # Check if user exists and password is correct
    if user and bcrypt.check_password_hash(user.password_hash, password):
        # Create JWT access token - identity can be user ID or username
        access_token = create_access_token(identity=str(user.id))
        print(f"User logged in: {username}")
        return jsonify(access_token=access_token)
    else:
        return jsonify({"msg": "Bad username or password"}), 401 # 401 Unauthorized


# Example Protected Route - Get current user info
@app.route('/api/user/me', methods=['GET'])
@jwt_required() # This decorator protects the route
def get_current_user():
    current_user_id = get_jwt_identity() # Get user ID from the token
    user = User.query.get(current_user_id)
    if not user:
         return jsonify({"msg": "User not found"}), 404 # Should not happen if token is valid

    # Don't return password hash!
    return jsonify({
        "id": user.id,
        "username": user.username
        # Add any other user info you want to return
    })

# --- Keep other API routes (get-content, quiz, pdf, flashcards, planner, chat) ---
# We will modify these later to use authentication and save data.

@app.route('/api/sessions', methods=['GET'])
@jwt_required() # Make sure this is present and uncommented
def get_user_sessions():
    """Returns a list of saved sessions (id, topic, created_at) for the current user."""
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user identity"}), 422

    try:
        # Order by most recent first
        sessions = SavedSession.query.filter_by(user_id=current_user_id).order_by(SavedSession.created_at.desc()).all()
        session_list = [{
            "id": session.id,
            "topic": session.topic,
            "created_at": session.created_at.isoformat() # Use ISO format string
        } for session in sessions]
        print(f"Fetched {len(session_list)} sessions for user {current_user_id}") # Add log
        return jsonify(session_list)
    except Exception as e:
        print(f"Error fetching sessions for user {current_user_id}: {e}")
        return jsonify({"error": f"Failed to fetch sessions: {str(e)}"}), 500

@app.route('/api/sessions/<int:session_id>', methods=['GET'])
@jwt_required()
def get_session_details(session_id):
    """Returns the full data for a specific saved session belonging to the current user."""
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user identity"}), 422

    try:
        session = SavedSession.query.filter_by(id=session_id, user_id=current_user_id).first()

        if session is None:
            return jsonify({"error": "Session not found or access denied"}), 404

        # Parse JSON strings back into Python objects before sending
        # Add default empty list/dict if parsing fails or field is None
        try: videos = json.loads(session.youtube_videos) if session.youtube_videos else []
        except (json.JSONDecodeError, TypeError): videos = []

        try: quiz = json.loads(session.quiz_questions) if session.quiz_questions else []
        except (json.JSONDecodeError, TypeError): quiz = []

        try: flashcards_data = json.loads(session.flashcards) if session.flashcards else []
        except (json.JSONDecodeError, TypeError): flashcards_data = []


        print(f"Fetched details for session {session_id} for user {current_user_id}") # Add log
        return jsonify({
            "id": session.id,
            "topic": session.topic,
            "notes": session.notes,
            "summary": session.summary,
            "videos": videos,
            "quizQuestions": quiz, # Match frontend state name
            "flashcards": flashcards_data, # Match frontend state name
            "created_at": session.created_at.isoformat()
        })
    except Exception as e:
        print(f"Error fetching session {session_id} for user {current_user_id}: {e}")
        return jsonify({"error": f"Failed to fetch session details: {str(e)}"}), 500

# --- ADD THIS FUNCTION ---
@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
@jwt_required()
def delete_session(session_id):
    """Deletes a specific saved session belonging to the current user."""
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user identity"}), 422

    try:
        session = SavedSession.query.filter_by(id=session_id, user_id=current_user_id).first()

        if session is None:
            return jsonify({"error": "Session not found or access denied"}), 404

        db.session.delete(session)
        db.session.commit()
        print(f"Deleted session {session_id} for user {current_user_id}") # Add log
        return jsonify({"message": "Session deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting session {session_id} for user {current_user_id}: {e}")
        return jsonify({"error": f"Failed to delete session: {str(e)}"}), 500


# --- API Routes ---
@app.route('/api/test', methods=['GET'])
def test_connection():
    print("Test endpoint hit!")
    return jsonify({"message": "Backend connected successfully!"})

@app.route('/api/get-content', methods=['POST'])
@jwt_required() # Protect this route
def get_content():
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user identity in token"}), 422

    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    topic = data.get('topic')
    if not topic: return jsonify({"error": "Missing 'topic'"}), 400

    print(f"User {current_user_id} requested topic: {topic}")

    # --- Generate Content using Gemini ---
    # Prompt for detailed notes
    notes_prompt = f"""
    Generate detailed study notes for the topic: "{topic}".
    Structure the notes clearly with headings, bullet points, and explanations where appropriate.
    Assume the audience is a student trying to understand this topic.
    Focus on accuracy and clarity.
    """
    notes = generate_gemini_content(notes_prompt)

    # Prompt for a concise summary
    summary_prompt = f"""
    Provide a concise summary (2-4 paragraphs) of the main points for the topic: "{topic}".
    Highlight the key concepts and definitions.
    """
    # Alternatively, summarize the generated notes:
    # summary_prompt = f"Summarize the following notes concisely (2-4 paragraphs):\n\n{notes}"
    summary = generate_gemini_content(summary_prompt)

    # --- Search YouTube ---
    videos = search_youtube(topic)

    # --- Save to Database ---
    session_id = None
    try:
        new_session = SavedSession(
            user_id=current_user_id,
            topic=topic,
            notes=notes,
            summary=summary,
            # Store lists/dicts as JSON strings in the Text column
            youtube_videos=json.dumps(videos) if videos else None,
            # Quiz/Flashcards initially null, will be updated later
            quiz_questions=None,
            flashcards=None
        )
        db.session.add(new_session)
        db.session.commit()
        session_id = new_session.id # Get the ID of the newly created session
        print(f"Saved new session {session_id} for user {current_user_id}")
    except Exception as e:
        db.session.rollback()
        print(f"Error saving session for user {current_user_id}: {e}")
        # Decide if you should still return content even if saving fails
        # For now, we'll return content but maybe indicate save failure

    # --- Return Results ---
    return jsonify({
        "session_id": session_id, # Return the new ID
        "topic": topic, # Also return topic for consistency
        "notes": notes,
        "summary": summary,
        "videos": videos
    })
@app.route('/api/generate-quiz', methods=['POST'])
@jwt_required() # Protect
def generate_quiz():
    current_user_id_str = get_jwt_identity()
    try: current_user_id = int(current_user_id_str)
    except ValueError: return jsonify({"msg": "Invalid user identity"}), 422

    if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
    data = request.get_json()
    notes_text = data.get('notes')
    session_id = data.get('session_id') # Expect session_id from frontend

    if not notes_text: return jsonify({"error": "Missing 'notes'"}), 400
    # session_id is needed to save the quiz to the correct session
    if session_id is None: return jsonify({"error": "Missing 'session_id'"}), 400

    print(f"User {current_user_id} generating quiz for session {session_id}")


    # --- Generate Quiz Questions using Gemini ---
    # UPDATED, STRICTER PROMPT:
    quiz_prompt = f"""
    Based ONLY on the following study notes, generate exactly 5 multiple-choice quiz questions suitable for a student.
    For each question, provide:
    1. The question text (string).
    2. A list of 4 distinct options (list of strings).
    3. The correct answer (string, exactly matching one of the options).
    4. A brief explanation (string) for why the answer is correct, based on the notes.

    Output the result ONLY as a valid JSON list (starting with '[' and ending with ']').
    Each element in the list must be an object with keys: "question", "options", "correct_answer", and "explanation".

    IMPORTANT: Do NOT include any introductory text, concluding remarks, code block markers (like ```json), or ANY characters whatsoever before the opening '[' or after the closing ']'. The entire response MUST be the JSON list itself.

    Study Notes:
    ---
    {notes_text}
    ---
    """

    quiz_content_raw = generate_gemini_content(quiz_prompt) # Use the existing helper

    print(f"Raw AI response for quiz:\n{quiz_content_raw}") # Keep logging the raw response

    # --- Parse the Response ---
    try:
        # Attempt to extract JSON list using regex - more robust!
        # This looks for the first '[' that seems to start a list/object structure
        # and the last ']' that appropriately closes it. Handles nested structures.
        match = re.search(r'\[\s*\{.*?\}\s*\]', quiz_content_raw, re.DOTALL)

        if not match:
             # Fallback: Maybe it returned a single object instead of a list? Less likely based on prompt.
             match = re.search(r'\{\s*".*?":.*?\s*\}', quiz_content_raw, re.DOTALL)
             if match:
                 print("Warning: AI returned a single JSON object, expected a list. Attempting to wrap in a list.")
                 potential_json = f"[{match.group(0)}]" # Wrap the single object in a list
             else:
                 raise ValueError("Could not find JSON list or object structure in the AI response using regex.")
        else:
             potential_json = match.group(0)


        print(f"Attempting to parse extracted JSON:\n{potential_json}")
        questions = json.loads(potential_json)

        # Basic validation
        if not isinstance(questions, list):
            # If we wrapped a single object, this check might fail unless we re-assign 'questions'
            if isinstance(questions, dict) and potential_json.startswith('['): # Check if we manually wrapped it
                 questions = [questions] # Put the single dict into a list
            else:
                 raise ValueError("Parsed JSON is not a list.")

        if not questions:
             raise ValueError("Parsed JSON list is empty.")

        # Check keys of the first question object
        required_keys = ["question", "options", "correct_answer", "explanation"]
        if not all(k in questions[0] for k in required_keys):
             missing_keys = [k for k in required_keys if k not in questions[0]]
             raise ValueError(f"Parsed JSON object missing required keys: {missing_keys}")

        print(f"Successfully parsed {len(questions)} quiz questions.")
    # --- Update Database ---
        try:
            session_to_update = SavedSession.query.filter_by(id=session_id, user_id=current_user_id).first()
            if session_to_update:
                session_to_update.quiz_questions = json.dumps(questions) # Store as JSON string
                db.session.commit()
                print(f"Updated session {session_id} with quiz questions.")
            else:
                print(f"Warning: Could not find session {session_id} for user {current_user_id} to save quiz.")
                # Decide how to handle: error or just return questions without saving?
                # Returning questions anyway for now.
        except Exception as e:
            db.session.rollback()
            print(f"Error updating session {session_id} with quiz: {e}")
            # Decide if this should prevent returning questions
        return jsonify(questions)
    

    except (json.JSONDecodeError, ValueError, TypeError) as e: # Catch different parsing/validation errors
        error_message = f"Failed to process AI response for quiz: {e}"
        print(error_message)
        # Log the raw response again in case of error for debugging
        print(f"Problematic Raw AI response was:\n{quiz_content_raw}")
        # Return error details to frontend if possible
        return jsonify({"error": error_message, "raw_response_snippet": quiz_content_raw[:500] + "..."}), 500 # Send snippet
    except Exception as e:
        # Catch any other unexpected errors
        error_message = f"An unexpected error occurred during quiz generation: {e}"
        print(error_message)
        print(f"Raw AI response was:\n{quiz_content_raw}")
        return jsonify({"error": error_message, "raw_response_snippet": quiz_content_raw[:500] + "..."}), 500
    
@app.route('/api/generate-pdf', methods=['POST'])
def generate_pdf_route():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    notes_text = data.get('notes')
    quiz_data = data.get('quizQuestions') # List of {question, correct_answer, ...}
    topic = data.get('topic', 'Study Notes')

    if not notes_text:
        return jsonify({"error": "Missing 'notes' text to generate PDF"}), 400

    try:
        # --- Convert Markdown to HTML ---
        # Use extensions for better formatting (e.g., tables, fenced code blocks if needed later)
        notes_html = markdown(notes_text, extensions=['fenced_code', 'tables'])

        # --- Prepare Quiz HTML (Question & Answer only) ---
        quiz_html = ""
        if quiz_data and isinstance(quiz_data, list) and len(quiz_data) > 0:
            quiz_html += "<h2>Quiz Review</h2><ol>"
            for i, q in enumerate(quiz_data):
                question_text = q.get('question', 'N/A')
                # Convert potential markdown in question to HTML
                question_html = markdown(question_text, extensions=['fenced_code'])
                # Remove surrounding <p> tags markdown might add
                question_html = question_html.replace('<p>', '').replace('</p>', '').strip()

                correct_answer = q.get('correct_answer', 'N/A')
                # Convert potential markdown in answer to HTML
                answer_html = markdown(correct_answer, extensions=['fenced_code'])
                answer_html = answer_html.replace('<p>', '').replace('</p>', '').strip()

                quiz_html += f"<li><strong>Question:</strong> {question_html}<br/>"
                quiz_html += f"<strong>Answer:</strong> {answer_html}</li><br/>" # Add line break for spacing
            quiz_html += "</ol>"

        # --- Combine into Full HTML Document ---
        # Basic HTML structure with some CSS for styling
        # Using default serif font, easy to read. Add more CSS as needed.
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page {{ margin: 1in; }} /* Set page margins */
                body {{ font-family: Georgia, serif; font-size: 11pt; line-height: 1.4; }}
                h1 {{ font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 20px; }}
                h2 {{ font-size: 14pt; font-weight: bold; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 2px;}}
                p {{ margin-top: 0; margin-bottom: 10px; }}
                ul, ol {{ margin-left: 20px; margin-bottom: 10px;}}
                li {{ margin-bottom: 5px; }}
                strong, b {{ font-weight: bold; }}
                em, i {{ font-style: italic; }}
                pre {{ background-color: #f0f0f0; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; }}
                code {{ font-family: 'Courier New', monospace; background-color: #f0f0f0; padding: 1px 3px; border-radius: 3px;}}
                /* Add more styles as needed */
            </style>
        </head>
        <body>
            <h1>{topic}</h1>

            <h2>Study Notes</h2>
            {notes_html}

            {quiz_html}
        </body>
        </html>
        """

        # --- Generate PDF using xhtml2pdf ---
        result_buffer = io.BytesIO() # Create a buffer to hold PDF data

        # Convert HTML to PDF
        pisa_status = pisa.CreatePDF(
            src=io.StringIO(html_content), # Source HTML (as string IO)
            dest=result_buffer             # Destination buffer
        )

        # Check for errors
        if pisa_status.err:
            raise Exception(f"PDF Generation Error: {pisa_status.err}")

        # --- Send PDF Response ---
        result_buffer.seek(0) # Reset buffer position to the beginning

        safe_topic = re.sub(r'[^a-zA-Z0-9_]', '_', topic)
        download_filename = f"{safe_topic}_Study_Notes.pdf"

        # Use Flask Response object for more control over headers
        return Response(
            result_buffer.getvalue(), # Get bytes from buffer
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment;filename="{download_filename}"'
            }
        )

    except Exception as e:
        print(f"!!! PDF Generation Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to generate PDF: {str(e)}"}), 500
    
@app.route('/api/generate-flashcards', methods=['POST'])
@jwt_required() # Protect
def generate_flashcards_route():
        current_user_id_str = get_jwt_identity()
        try: current_user_id = int(current_user_id_str)
        except ValueError: return jsonify({"msg": "Invalid user identity"}), 422

        if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
        data = request.get_json()
        notes_text = data.get('notes')
        session_id = data.get('session_id') # Expect session_id

        if not notes_text: return jsonify({"error": "Missing 'notes'"}), 400
        if session_id is None: return jsonify({"error": "Missing 'session_id'"}), 400

        print(f"User {current_user_id} generating flashcards for session {session_id}")

        # --- Generate Flashcards using Gemini ---
        flashcard_prompt = f"""
        Analyze the following study notes and extract key terms and their definitions.
        Generate a list of flashcards based ONLY on the provided text.
        For each flashcard, provide:
        1. "term": The key term or concept (string, keep it concise).
        2. "definition": A clear and concise definition of the term based on the notes (string).

        Output the result ONLY as a valid JSON list where each element is an object with keys "term" and "definition".
        Aim for around 5-15 flashcards, focusing on the most important concepts.

        IMPORTANT: Do NOT include any introductory text, concluding remarks, code block markers (like ```json), or ANY characters whatsoever before the opening '[' or after the closing ']'. The entire response MUST be the JSON list itself.

        Study Notes:
        ---
        {notes_text}
        ---
        """

        flashcard_content_raw = generate_gemini_content(flashcard_prompt) # Reuse helper

        print(f"Raw AI response for flashcards:\n{flashcard_content_raw}")

        # --- Parse the Response (Similar to Quiz Parsing) ---
        try:
            # Attempt to extract JSON list using regex
            match = re.search(r'\[\s*\{.*?\}\s*\]', flashcard_content_raw, re.DOTALL)
            if not match:
                raise ValueError("Could not find JSON list structure in the AI response using regex.")

            potential_json = match.group(0)
            print(f"Attempting to parse extracted flashcard JSON:\n{potential_json}")
            flashcards = json.loads(potential_json)

                        # Basic validation
            if not isinstance(flashcards, list):
                raise ValueError("Parsed JSON is not a list.")
            # Allow empty list as valid response
            if flashcards and not all(k in flashcards[0] for k in ["term", "definition"]):
                missing_keys = [k for k in ["term", "definition"] if k not in flashcards[0]]
                raise ValueError(f"Parsed JSON object missing required keys: {missing_keys}")

            print(f"Successfully parsed {len(flashcards)} flashcards.")
            
            # --- Update Database ---
            try:
                session_to_update = SavedSession.query.filter_by(id=session_id, user_id=current_user_id).first()
                if session_to_update:
                    session_to_update.flashcards = json.dumps(flashcards) # Store as JSON string
                    db.session.commit()
                    print(f"Updated session {session_id} with flashcards.")
                else:
                    print(f"Warning: Could not find session {session_id} for user {current_user_id} to save flashcards.")
            except Exception as e:
                db.session.rollback()
                print(f"Error updating session {session_id} with flashcards: {e}")

            return jsonify(flashcards) # Return generated flashcards

        except (json.JSONDecodeError, ValueError, TypeError) as e:
            error_message = f"Failed to process AI response for flashcards: {e}"
            print(error_message)
            print(f"Problematic Raw AI response was:\n{flashcard_content_raw}")
            return jsonify({"error": error_message, "raw_response_snippet": flashcard_content_raw[:500] + "..."}), 500
        except Exception as e:
            error_message = f"An unexpected error occurred during flashcard generation: {e}"
            print(error_message)
            print(f"Raw AI response was:\n{flashcard_content_raw}")
            return jsonify({"error": error_message, "raw_response_snippet": flashcard_content_raw[:500] + "..."}), 500


@app.route('/api/download-flashcards', methods=['POST'])
def download_flashcards_route():
        """
        Endpoint to convert flashcard JSON data to a downloadable CSV file.
        Expects JSON payload: {"flashcards": [{ "term": "...", "definition": "..." }, ...]}
        """
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400

        data = request.get_json()
        flashcards = data.get('flashcards')
        topic = data.get('topic', 'flashcards') # Get topic for filename

        if not isinstance(flashcards, list):
            return jsonify({"error": "Invalid or missing 'flashcards' list in request body"}), 400

        try:
            # --- Generate CSV String ---
            # Simple CSV generation: Header + one line per card
            # Wrap fields in double quotes to handle potential commas within term/definition
            # Double up existing double quotes within fields to escape them
            csv_lines = ['"Term","Definition"'] # Header row
            for card in flashcards:
                term = str(card.get('term', '')).replace('"', '""') # Escape double quotes
                definition = str(card.get('definition', '')).replace('"', '""') # Escape double quotes
                csv_lines.append(f'"{term}","{definition}"')

            csv_data = "\n".join(csv_lines)

            # --- Send CSV Response ---
            safe_topic = re.sub(r'[^a-zA-Z0-9_]', '_', topic)
            download_filename = f"{safe_topic}_flashcards.csv"

            return Response(
                csv_data,
                mimetype='text/csv',
                headers={
                    "Content-Disposition": f"attachment;filename=\"{download_filename}\""
                }
            )
        except Exception as e:
            print(f"CSV Generation/Download Error: {e}")
            traceback.print_exc()
            return jsonify({"error": f"Failed to generate or download CSV: {str(e)}"}), 500

    # --- Keep the main entry point ---
    # if __name__ == '__main__':
    #    app.run(debug=True)

# --- Study Planner API Routes ---

@app.route('/api/study-plan', methods=['POST'])
@jwt_required()
def add_study_plan_entry():
    current_user_id = None # Initialize to None
    current_user_id_str = get_jwt_identity()
    print(f"--- ADD STUDY PLAN --- Raw JWT Identity: '{current_user_id_str}' (type: {type(current_user_id_str)})")

    if not current_user_id_str: # Check if it's None or empty string
        print("--- ADD STUDY PLAN --- JWT Identity is None or empty.")
        return jsonify({"msg": "Missing user identity in token"}), 401 # Or 422

    try:
        current_user_id = int(current_user_id_str)
        print(f"--- ADD STUDY PLAN --- Converted User ID (int): {current_user_id}")
    except (ValueError, TypeError) as e:
        print(f"--- ADD STUDY PLAN --- Error converting JWT identity '{current_user_id_str}' to int: {e}")
        return jsonify({"msg": "Invalid user identity format in token"}), 422

    # At this point, current_user_id MUST be an integer if no error was returned.
    # Let's add one more check just to be absolutely sure.
    if not isinstance(current_user_id, int):
        print(f"--- ADD STUDY PLAN --- CRITICAL: current_user_id is not an int after conversion attempts: {current_user_id} (type: {type(current_user_id)})")
        return jsonify({"msg": "Internal server error processing user identity"}), 500


    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    topic = data.get('topic')
    review_date_str = data.get('review_date')

    if not topic or not review_date_str:
        return jsonify({"error": "Missing 'topic' or 'review_date'"}), 400
    try:
        datetime.strptime(review_date_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    try:
        print(f"--- ADD STUDY PLAN --- Creating entry with topic: '{topic}', date: '{review_date_str}', user_id: {current_user_id}")
        new_entry = StudyPlanEntry(topic=topic, review_date=review_date_str, user_id=current_user_id)
        db.session.add(new_entry)
        db.session.commit()
        print(f"Added study plan entry: ID {new_entry.id} for User {current_user_id}")
        return jsonify({
            "id": new_entry.id,
            "topic": new_entry.topic,
            "review_date": new_entry.review_date
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"--- ADD STUDY PLAN --- Database error: {e}")
        # Log the full traceback for detailed debugging if needed
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to add study plan entry (DB): {str(e)}"}), 500


@app.route('/api/study-plan', methods=['GET'])
@jwt_required()
def get_study_plan_entries():
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
        print(f"--- GET STUDY PLAN --- Fetching plans for User ID: {current_user_id}") # Add/Confirm log
    except (ValueError, TypeError):
        print(f"--- GET STUDY PLAN --- Invalid JWT identity: {current_user_id_str}") # Add/Confirm log
        return jsonify({"msg": "Invalid user identity"}), 422
    try:
        # Order by review date, then by ID
        entries = StudyPlanEntry.query.filter_by(user_id=current_user_id).order_by(StudyPlanEntry.review_date, StudyPlanEntry.id).all()
        entries_list = [{
            "id": entry.id,
            "topic": entry.topic,
            "review_date": entry.review_date
        } for entry in entries]
        print(f"--- GET STUDY PLAN --- Found {len(entries_list)} entries for User ID: {current_user_id}") # Add/Confirm log
        return jsonify(entries_list)
    except Exception as e:
        print(f"Error fetching study plan entries for user {current_user_id}: {e}")
        return jsonify({"error": f"Failed to fetch study plan entries: {str(e)}"}), 500


@app.route('/api/study-plan/<int:entry_id>', methods=['DELETE'])
@jwt_required()
def delete_study_plan_entry(entry_id):
    current_user_id_str = get_jwt_identity()
    try:
        current_user_id = int(current_user_id_str)
    except ValueError:
        return jsonify({"msg": "Invalid user identity"}), 422

    try:
        # *** Ensure filtering by user_id for security ***
        entry = StudyPlanEntry.query.filter_by(id=entry_id, user_id=current_user_id).first()
        if entry is None:
            return jsonify({"error": "Entry not found or access denied"}), 404

        db.session.delete(entry)
        db.session.commit()
        print(f"Deleted study plan entry ID: {entry_id}")
        return jsonify({"message": "Entry deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting study plan entry: {e}")
        return jsonify({"error": f"Failed to delete entry: {str(e)}"}), 500

# --- Keep the main entry point ---
# if __name__ == '__main__':
#    app.run(debug=True)

# --- Chatbot API Route ---

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    user_message = data.get('message')
    notes_context = data.get('context') # The generated notes text

    if not user_message:
        return jsonify({"error": "Missing 'message' in request body"}), 400
    if not notes_context:
        # Allow chatting even without notes, but AI won't be grounded
        print("Warning: Chat request received without notes context.")
        # return jsonify({"error": "Missing 'context' (notes) in request body"}), 400 # Or handle gracefully

    print(f"Received chat message: {user_message}")
    # print(f"Using context length: {len(notes_context)}") # Optional: monitor context size

    # --- Construct Prompt for Gemini ---
    # Instruct the AI on its role, knowledge source, and limitations
    system_prompt = f"""
    You are a helpful AI study assistant and tutor. Your primary goal is to answer student questions based *only* on the provided study notes context.

    Follow these instructions strictly:
    1. Analyze the user's question: "{user_message}"
    2. Consult the provided "Study Notes Context" below to find the answer.
    3. If the answer is found in the notes, provide a clear and concise explanation based *only* on that information. Quote or reference parts of the notes if helpful.
    4. If the answer cannot be found *within the provided notes context*, clearly state that the information is not available in the current notes. Do NOT make up information or use external knowledge. Politely suggest asking a different question related to the notes or generating content on a relevant topic.
    5. Keep your answers focused and directly related to the user's question and the provided context.
    6. Be friendly and encouraging.

    Study Notes Context:
    ---
    {notes_context if notes_context else "No study notes were provided for context."}
    ---

    Now, please answer the user's question: "{user_message}"
    """

    try:
        # Use the same Gemini helper function
        # Consider potential length issues if notes_context is huge, but Gemini 1.5 handles large contexts
        ai_response_text = generate_gemini_content(system_prompt)

        print(f"AI chat response generated.")
        return jsonify({"response": ai_response_text})

    except Exception as e:
        error_message = f"An unexpected error occurred during chat generation: {e}"
        print(error_message)
        traceback.print_exc()
        return jsonify({"error": error_message}), 500

# --- Keep the main entry point ---
# if __name__ == '__main__':
#    app.run(debug=True)



# Main entry point
if __name__ == '__main__':
    app.run(debug=True) # Keep debug=True for development auto-reload