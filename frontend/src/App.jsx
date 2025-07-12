import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './context/useAuth'; // Import useAuth
import LoginPage from './pages/LoginPage'; // Import Login page
import RegisterPage from './pages/RegisterPage'; // Import Register page
import MenuIcon from '@mui/icons-material/Menu'; // Sandwich icon
import AccountCircle from '@mui/icons-material/AccountCircle'; // User icon
import ChatIcon from '@mui/icons-material/Chat'; // Icon for chatbot FAB
import QuizIcon from '@mui/icons-material/Quiz'; // Icon for Generate Quiz
import FlashOnIcon from '@mui/icons-material/FlashOn'; // Icon for Generate Flashcards
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'; // Icon for Download PDF
import { IconButton } from '@mui/material';
import { ArrowBackIos, ArrowForwardIos } from '@mui/icons-material';

// Material UI Imports
import {
  // Core Layout & Input
  CssBaseline, Container, Typography, Box, TextField, Button,
  CircularProgress, Paper, Grid, Card, CardMedia, CardContent,
  Link, Alert, Divider, InputBase, Tooltip,

  // Form Controls
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,

  // Navigation & Menus
  AppBar, Toolbar, Menu, MenuItem, Drawer, // Keep IconButton here

  // Lists
  List, ListItem, ListItemButton, ListItemText, ListItemIcon, ListItemSecondaryAction,

  // Feedback
  LinearProgress,

  // Accordion
  Accordion, AccordionSummary, AccordionDetails,

  // Dialog & FAB
  Fab, Dialog, DialogTitle, DialogContent, DialogActions,

} from '@mui/material';

// Date and Icons
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import DeleteIcon from '@mui/icons-material/Delete';
import EventNoteIcon from '@mui/icons-material/EventNote';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';

// Date formatting
import { format } from 'date-fns';
import HistoryIcon from '@mui/icons-material/History';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'; // For "New Chat" button

// Markdown
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Carousel
import Slider from "react-slick"; // Import react-slick for carousel
import "slick-carousel/slick/slick.css"; // Import slick carousel styles
import "slick-carousel/slick/slick-theme.css"; // Import slick carousel theme

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth(); // Get auth status from context

  // While the AuthContext is initially checking the token, show a loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // If the initial check is done and the user is NOT authenticated...
  if (!isAuthenticated) {
    // ...redirect them to the login page.
    // `replace` prevents the user from going back to the protected route via the browser's back button.
    return <Navigate to="/login" replace />;
  }

  // If the initial check is done and the user IS authenticated...
  // ...render the child components that were passed into ProtectedRoute.
  // This will be your main application UI.
  return children;
}


export default function App() {
  // --- State Variables ---
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [summary, setSummary] = useState('');
  const [videos, setVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false); // Loading for main content
  const [error, setError] = useState(null); // Error for main content fetch

  // --- Quiz State ---
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [quizIsLoading, setQuizIsLoading] = useState(false); // Loading for quiz generation
  const [, setQuizError] = useState(null); // Error for quiz generation

  // --- PDF State ---
  const [pdfIsLoading, setPdfIsLoading] = useState(false); // Loading for PDF generation
  const [, setPdfError] = useState(null); // Error for PDF generation

  // --- Flashcard State ---
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false); // Track if definition side is shown
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [, setFlashcardsError] = useState(null);

  // --- Study Planner State ---
  const [studyPlanEntries, setStudyPlanEntries] = useState([]);
  const [newPlanDate, setNewPlanDate] = useState(null); // Store date object from picker
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);

  // --- Chatbot State ---
  const [chatHistory, setChatHistory] = useState([]); // Array of { sender: 'user'|'ai', text: '...' }
  const [chatInput, setChatInput] = useState('');
  const [chatIsLoading, setChatIsLoading] = useState(false); // Loading AI response
  const [chatError, setChatError] = useState(null);
  const chatMessagesEndRef = useRef(null); // Ref for auto-scrolling

  // --- Auth Hook & Navigation ---
  const { isAuthenticated, user, logout, isLoading: authIsLoading, apiClient } = useAuth(); // Add apiClient here
  const navigate = useNavigate(); // For programmatic navigation

   // Add state for the user menu in the AppBar
   const [anchorEl, setAnchorEl] = useState(null);
   const handleMenu = (event) => { setAnchorEl(event.currentTarget); };
   const handleClose = () => { setAnchorEl(null); };
   const handleLogout = () => {
     logout(); // Call logout from AuthContext
     handleClose(); // Close the menu
     navigate('/login'); // Redirect to login page
   };

   // --- Sidebar/History State ---
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionHistory, setSessionHistory] = useState([]); // List of {id, topic, created_at}
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null); // ID of the currently loaded session

  // State for controlling the Study Planner modal
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const handleOpenPlanner = () => setIsPlannerOpen(true);
  const handleClosePlanner = () => setIsPlannerOpen(false);

  // State for controlling the Chatbot modal
  const [isChatOpen, setIsChatOpen] = useState(false);
  const handleOpenChat = () => setIsChatOpen(true);
  const handleCloseChat = () => setIsChatOpen(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    // This effect runs after the component mounts and when isAuthenticated changes.
    // This is mainly a fallback or for re-initialization if the AppBar re-renders.
    // The primary initialization should happen via the onload callback in index.html.
    if (isAuthenticated && window.google && window.google.translate && typeof window.googleTranslateElementInit === 'function') {
      // Check if the div exists and is empty (widget not rendered inside yet)
      const translateElement = document.getElementById('google_translate_element');
      if (translateElement && translateElement.innerHTML.trim() === '') {
        // console.log("React useEffect: Triggering googleTranslateElementInit as target div is empty."); // Debug log
        window.googleTranslateElementInit();
      }
    }
  }, [isAuthenticated, authIsLoading]);

  // --- Handler Functions ---

  // Inside App component function:
  const fetchStudyPlan = useCallback(async () => { // Wrap with useCallback
    // Make sure apiClient is listed as a dependency if used inside
    if (!isAuthenticated) return; // Check auth state inside if needed
    setPlanLoading(true);
    setPlanError(null);
    try {
        const response = await apiClient.get('/study-plan'); // Use apiClient
        setStudyPlanEntries(response.data || []);
    } catch (err) {
        console.error("Error fetching study plan:", err);
        setPlanError(err.response?.data?.error || err.message || "Failed to fetch study plan.");
    } finally { setPlanLoading(false); }
  }, [isAuthenticated, apiClient]); // Dependencies of fetchStudyPlan

  const fetchSessionHistory = useCallback(async () => { // Wrap with useCallback
      if (!isAuthenticated) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
          const response = await apiClient.get('/sessions'); // Use apiClient
          setSessionHistory(response.data || []);
      } catch (err) {
          console.error("Error fetching session history:", err);
          setHistoryError(err.response?.data?.error || err.message || "Failed to fetch session history.");
      } finally { setHistoryLoading(false); }
  }, [isAuthenticated, apiClient]); // Dependencies of fetchSessionHistory

  const toggleDrawer = (open) => (event) => {
    if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
      return;
    }
    setDrawerOpen(open);
  };

  // Load a specific session's data
  const loadSession = async (sessionId) => {
  if (!sessionId) return;
  console.log("Loading session:", sessionId);
  setIsLoading(true); // Use main loading indicator
  setError(null);
  setDrawerOpen(false); // Close drawer after selection

  // Clear potentially stale data from previous session first
  setNotes(''); setSummary(''); setVideos([]); setQuizQuestions([]); setFlashcards([]); setChatHistory([]); // Clear chat too
  setQuizCompleted(false); setQuizError(null); setFlashcardsError(null); setPdfError(null); setChatError(null); // Clear errors

  try {
      const response = await apiClient.get(`/sessions/${sessionId}`);
      const sessionData = response.data;

      // Update main state with loaded data
      setTopic(sessionData.topic || '');
      setNotes(sessionData.notes || '');
      setSummary(sessionData.summary || '');
      setVideos(sessionData.videos || []);
      setQuizQuestions(sessionData.quizQuestions || []);
      setFlashcards(sessionData.flashcards || []);
      setCurrentSessionId(sessionData.id); // Track the loaded session ID

      // Reset quiz/flashcard generation states if loading existing ones
      // (User might want to regenerate later)

  } catch (err) {
      console.error(`Error loading session ${sessionId}:`, err);
      setError(err.response?.data?.error || err.message || "Failed to load session.");
      setCurrentSessionId(null); // Reset session ID on error
  } finally {
      setIsLoading(false);
  }
  };

  // Delete a session
  const handleDeleteSession = async (sessionId, event) => {
    event.stopPropagation(); // Prevent triggering loadSession when clicking delete icon
    if (!sessionId) return;
    console.log("Deleting session:", sessionId);
    // Optionally add a confirmation dialog here
    // setHistoryLoading(true); // Can use history loading state

    try {
        await apiClient.delete(`/sessions/${sessionId}`);
        // Refresh history after deletion
        fetchSessionHistory();
        // If the deleted session was the currently loaded one, clear the main view
        if (currentSessionId === sessionId) {
            handleNewSession(); // Use handleNewSession to clear view
        }
    } catch (err) {
        console.error(`Error deleting session ${sessionId}:`, err);
        setHistoryError(err.response?.data?.error || err.message || "Failed to delete session.");
        // setHistoryLoading(false);
    }
  };

  // Function to clear the current view and prepare for new input
  const handleNewSession = useCallback(() => {
    setTopic('');
    setNotes('');
    setSummary('');
    setVideos([]);
    setQuizQuestions([]);
    setFlashcards([]);
    setChatHistory([]);
    setCurrentSessionId(null); // Important: No active session loaded
    // Clear errors
    setError(null);
    setQuizError(null);
    setFlashcardsError(null);
    setPdfError(null);
    setChatError(null);
    setPlanError(null); // Clear planner error too
    // Close drawer if open
    setDrawerOpen(false);
  }, [setTopic, setNotes, setSummary, setVideos, setQuizQuestions, setFlashcards, setChatHistory, setCurrentSessionId, setError, setQuizError, setFlashcardsError, setPdfError, setChatError, setPlanError, setDrawerOpen]);

  const handleGetContent = () => {
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }
  
    setIsLoading(true);
    setError(null);
  
    // Clear content for a "new" session feel
    handleNewSession(); // Resets everything except topic
    setIsLoading(true); // handleNewSession sets loading false, so set it true again
  
    apiClient.post('/get-content', { topic: topic })
      .then(response => {
        const { session_id, topic: resTopic, notes, summary, videos } = response.data;
  
        setTopic(resTopic || topic); // Update topic if backend modified it
        setNotes(notes || "No notes generated.");
        setSummary(summary || "No summary generated.");
        setVideos(videos || []);
        setCurrentSessionId(session_id); // Store new session ID
  
        // Update session history with new session
        fetchSessionHistory();
      })
      .catch(err => {
        console.error("Error fetching data:", err);
        const errorMsg = err.response?.data?.error || err.message || "Failed to fetch content.";
        setError(errorMsg);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };  

  const handleGenerateQuiz = () => {
    if (!notes) {
      setQuizError("Cannot generate quiz without notes.");
      return;
    }
  
    setQuizIsLoading(true);
    setQuizError(null);
    setQuizQuestions([]);
    setQuizCompleted(false);
    setCurrentQuestionIndex(0);
    setScore(0);
    setSelectedAnswer('');
    setShowFeedback(false);
  
    apiClient.post('/generate-quiz', {
      notes: notes,
      session_id: currentSessionId // Send current session ID
    })
      .then(response => {
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          setQuizQuestions(response.data);
        } else {
          console.error("Invalid quiz data received:", response.data);
          setQuizError("Received empty or invalid quiz data from backend.");
          setQuizQuestions([]);
        }
      })
      .catch(err => {
        console.error("Error generating quiz:", err);
        const errorMsg = err.response?.data?.error || err.message || "Failed to generate quiz.";
        setQuizError(errorMsg);
        if (err.response?.data?.raw_response_snippet) {
          console.error("Raw response snippet from backend:", err.response.data.raw_response_snippet);
        }
      })
      .finally(() => {
        setQuizIsLoading(false);
      });
  };
  

  // Handle selecting a quiz answer
  const handleAnswerChange = (event) => {
    setSelectedAnswer(event.target.value);
  };

  // Handle submitting a quiz answer
  const handleSubmitAnswer = () => {
    if (!selectedAnswer) return;
    const currentQuestion = quizQuestions[currentQuestionIndex];
    // Ensure correct_answer exists before comparing
    if (currentQuestion && selectedAnswer === currentQuestion.correct_answer) {
      setScore(prevScore => prevScore + 1);
    }
    setShowFeedback(true);
  };

  // Handle moving to the next quiz question
  const handleNextQuestion = () => {
    setShowFeedback(false);
    setSelectedAnswer('');
    if (currentQuestionIndex < quizQuestions.length - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
    } else {
      setQuizCompleted(true);
    }
  };

  // Handle retaking/clearing the quiz
  // const handleRetakeQuiz = () => {
  //   setQuizQuestions([]);
  //   setQuizCompleted(false);
  //   setCurrentQuestionIndex(0);
  //   setScore(0);
  //   setSelectedAnswer('');
  //   setShowFeedback(false);
  //   setQuizError(null);
  //   // Decide if you want to auto-regenerate or just clear
  //   // handleGenerateQuiz(); // Uncomment to immediately regenerate
  // };

  const handleRegenerateQuiz = () => {
    if (!notes || !currentSessionId) { // Ensure notes and a session context exist
        setQuizError("Cannot regenerate quiz without loaded notes and an active session.");
        return;
    }
    console.log("Regenerating quiz for session:", currentSessionId);

    // Set loading states and clear previous quiz specific states
    setQuizIsLoading(true);
    setQuizError(null);
    setQuizQuestions([]); // Clear existing questions before fetching new ones
    setCurrentQuestionIndex(0);
    setSelectedAnswer('');
    setScore(0);
    setShowFeedback(false);
    setQuizCompleted(false);

    apiClient.post('/generate-quiz', {
        notes: notes,
        session_id: currentSessionId // Send current session ID to update it
    })
    .then(response => {
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            setQuizQuestions(response.data);
        } else {
            console.error("Invalid quiz data received on regenerate:", response.data);
            setQuizError("Received empty or invalid new quiz data from backend.");
            setQuizQuestions([]);
        }
    })
    .catch(err => {
        console.error("Error regenerating quiz:", err);
        const errorMsg = err.response?.data?.error || err.message || "Failed to regenerate quiz.";
        setQuizError(errorMsg);
        if(err.response?.data?.raw_response_snippet) {
          console.error("Raw response snippet from backend:", err.response.data.raw_response_snippet);
        }
    })
    .finally(() => {
        setQuizIsLoading(false);
    });
};

  // Handle PDF Download
  const handleDownloadPdf = () => {
    if (!notes) {
      setPdfError("Notes must be generated before downloading PDF.");
      return;
    }
    setPdfIsLoading(true);
    setPdfError(null);
    const pdfData = {
      topic: topic || 'Study Notes',
      notes: notes,
      quizQuestions: quizQuestions // Send quiz data (backend will handle Q&A extraction)
    };

    axios.post('http://127.0.0.1:5000/api/generate-pdf', pdfData, {
      responseType: 'blob', // Expect binary file data
    })
      .then(response => {
        const file = new Blob([response.data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = fileURL;

        const contentDisposition = response.headers['content-disposition'];
        let filename = `${(topic || 'study').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.pdf`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
          if (filenameMatch && filenameMatch.length === 2) {
            filename = filenameMatch[1];
          }
        }
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(fileURL);
      })
      .catch(async (error) => { // Make catch async
        console.error('Error downloading PDF:', error);
        let errorMsg = "Failed to download PDF.";
        // Try reading error from blob if backend sent JSON error
        if (error.response && error.response.data instanceof Blob && error.response.data.type.includes('json')) {
          try {
            const errorJsonText = await error.response.data.text();
            const errorJson = JSON.parse(errorJsonText);
            errorMsg = errorJson.error || errorMsg;
            console.error("Backend PDF Error:", errorJson);
          } catch (parseError) {
            console.error("Failed to parse error response blob:", parseError);
          }
        } else if (error.message) {
          errorMsg = error.message;
        }
        setPdfError(errorMsg);
      })
      .finally(() => {
        setPdfIsLoading(false);
      });
  };

  const handleGenerateFlashcards = () => {
    if (!notes) {
      setFlashcardsError("Cannot generate flashcards without notes.");
      return;
    }
  
    setFlashcardsLoading(true);
    setFlashcardsError(null);
    setFlashcards([]); // Clear previous flashcards
    setCurrentCardIndex(0);
    setIsFlipped(false);
  
    apiClient.post('/generate-flashcards', {
      notes: notes,
      session_id: currentSessionId // Send current session ID
    })
      .then(response => {
        if (response.data && Array.isArray(response.data)) {
          setFlashcards(response.data);
          if (response.data.length === 0) {
            setFlashcardsError("No key terms found for flashcards.");
          }
        } else {
          console.error("Invalid flashcard data received:", response.data);
          setFlashcardsError("Received invalid flashcard data from backend.");
          setFlashcards([]);
        }
      })
      .catch(err => {
        console.error("Error generating flashcards:", err);
        const errorMsg = err.response?.data?.error || err.message || "Failed to generate flashcards.";
        setFlashcardsError(errorMsg);
        if (err.response?.data?.raw_response_snippet) {
          console.error("Raw response snippet from backend:", err.response.data.raw_response_snippet);
        }
      })
      .finally(() => {
        setFlashcardsLoading(false);
      });
  };
  

  // Implement Flashcard Navigation/Flip Handlers:
  const handleFlipCard = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNextCard = () => {
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false); // Show term side first on new card
    }
  };

  const handlePrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false); // Show term side first on new card
    }
  };

  // Implement Flashcard Download Handler:
  const handleDownloadFlashcards = () => {
    if (!flashcards || flashcards.length === 0) {
      setFlashcardsError("No flashcards available to download.");
      return;
    }
    // Consider adding a loading state specific to download if needed
    setFlashcardsError(null);

    axios.post('http://127.0.0.1:5000/api/download-flashcards',
      {
        flashcards: flashcards, // Send the array of flashcards
        topic: topic || 'flashcards' // Send topic for filename
      },
      { responseType: 'blob' } // Expect blob for file download
    )
      .then(response => {
        const file = new Blob([response.data], { type: 'text/csv;charset=utf-8;' }); // Specify charset
        const fileURL = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = fileURL;

        const contentDisposition = response.headers['content-disposition'];
        let filename = `${(topic || 'flashcards').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
          if (filenameMatch && filenameMatch.length === 2) {
            filename = filenameMatch[1];
          }
        }
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(fileURL);
      })
      .catch(async (error) => { // Async catch for potential blob reading
        console.error('Error downloading flashcards CSV:', error);
        let errorMsg = "Failed to download flashcards CSV.";
        if (error.response && error.response.data instanceof Blob) {
          try { // Try reading blob as text, might contain JSON error from backend
            const errorText = await error.response.data.text();
            try { // Try parsing as JSON
              const errorJson = JSON.parse(errorText);
              errorMsg = errorJson.error || errorMsg;
              console.error("Backend CSV Download Error:", errorJson);
            } catch { // If not JSON, use the text directly
              errorMsg = errorText.substring(0, 100) || errorMsg; // Show snippet
              console.error("Backend CSV Download Error (non-JSON):", errorText);
            }
          } catch (readError) {
            console.error("Failed to read error response blob:", readError);
          }
        } else if (error.message) {
          errorMsg = error.message;
        }
        setFlashcardsError(errorMsg);
      });
  };

  // --- Study Planner Handlers ---

  // Add a new entry
  const handleAddPlanEntry = () => {
    if (!topic || !newPlanDate) {
        setPlanError("Please ensure a topic is loaded and select a review date.");
        return;
    }
    setPlanLoading(true); // Indicate loading for add operation
    setPlanError(null);

    // Format the date object as YYYY-MM-DD string for the backend
    const formattedDate = format(newPlanDate, 'yyyy-MM-dd');

    apiClient.post('/study-plan', {
      topic: topic,
      review_date: formattedDate
  })
    .then(() => {
        // Add the new entry to the state immediately (optimistic update or refetch)
        // Refetching is simpler:
        fetchStudyPlan(); // Refetch the whole list
        setNewPlanDate(null); // Clear the date picker
    })
    .catch(err => {
      console.error("Error adding study plan entry:", err);
      // Log the full error for more details, especially if it's not a typical HTTP error
      if (err.toJSON) { console.error("Full Axios error details:", err.toJSON()); }
      else { console.error("Full error object:", err); }
        setPlanError(err.response?.data?.error || err.message || "Failed to add entry.");
        setPlanLoading(false); // Ensure loading is false on error
    });
    // Note: fetchStudyPlan will set planLoading to false on its completion
  };

  // Delete an entry
  const handleDeletePlanEntry = (id) => {
    setPlanLoading(true); // Indicate loading for delete operation
    setPlanError(null);
    apiClient.delete(`/study-plan/${id}`)
        .then(() => {
            fetchStudyPlan(); // Refetch the list after deletion
        })
        .catch(err => {
          console.error("Error deleting study plan entry:", err);
          if (err.toJSON) { console.error("Full Axios error details:", err.toJSON()); }
          else { console.error("Full error object:", err); }
            setPlanError(err.response?.data?.error || err.message || "Failed to delete entry.");
            setPlanLoading(false); // Ensure loading is false on error
        });
  };

  // --- useEffect to fetch data and clear state on auth change ---
// In App.jsx
useEffect(() => {
  if (isAuthenticated) {
     console.log("Authenticated, fetching user-specific data..."); // Add log
     fetchStudyPlan();
     fetchSessionHistory();
  } else {
     console.log("Not authenticated, clearing data..."); // Add log
     setStudyPlanEntries([]);
     setSessionHistory([]);
     handleNewSession();
  }
}, [isAuthenticated, fetchStudyPlan, fetchSessionHistory, handleNewSession]); // Ensure all dependencies are here


  // --- Chatbot Handlers ---

  const handleChatInputChange = (event) => {
    setChatInput(event.target.value);
  };

  const handleSendChatMessage = () => {
    const messageText = chatInput.trim();
    if (!messageText || chatIsLoading) {
        return; // Don't send empty messages or while loading
    }

    // Add user message to history
    const newUserMessage = { sender: 'user', text: messageText };
    setChatHistory(prev => [...prev, newUserMessage]);
    setChatInput(''); // Clear input field
    setChatIsLoading(true);
    setChatError(null);

    // Send message and context to backend
    apiClient.post('/chat', {
      message: messageText,
      context: notes // Send the current notes as context
  })
    .then(response => {
        const aiResponseText = response.data?.response || "Sorry, I couldn't get a response.";
        const newAiMessage = { sender: 'ai', text: aiResponseText };
        setChatHistory(prev => [...prev, newAiMessage]);
    })
    .catch(err => {
      console.error("Error sending chat message:", err);
      if (err.toJSON) { console.error("Full Axios error details:", err.toJSON()); }
      else { console.error("Full error object:", err); }
        const errorMsg = err.response?.data?.error || err.message || "Failed to get chat response.";
        setChatError(errorMsg);
        // Optionally add an error message to chat history
        setChatHistory(prev => [...prev, { sender: 'ai', text: `Error: ${errorMsg}` }]);
    })
    .finally(() => {
        setChatIsLoading(false);
    });
  };

  // --- useEffect for Auto-Scrolling Chat ---
  const scrollToBottom = () => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]); // Scroll whenever chatHistory changes

// --- JSX Rendering with Routing & Sidebar ---
return (
  <React.Fragment>
    <CssBaseline />
    
    {/* =================== AppBar =================== */}
    {/* Show AppBar only if authenticated and initial auth check is done */}
    {!authIsLoading && isAuthenticated && (
        <AppBar
          position="static"
          sx={{
            mb: 2,
            background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
            boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
          }}
        >
          <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Menu button to open the Drawer */}
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={toggleDrawer(true)} // *** Open Drawer onClick ***
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              component="div"
              sx={{
                flexGrow: 1,
                fontWeight: 'bold',
                fontSize: '1.5rem',
                color: '#ffffff',
                textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
              }}
            >
              LastLeap
            </Typography>
            {/* --- Google Translate Element Placeholder --- */}
            <Box
              id="google_translate_element"
              sx={{
                display: 'inline-block',
                background: '#ffffff',
                borderRadius: '20px',
                padding: '4px 12px',
                boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.1)',
                '& select': {
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  color: '#6a11cb',
                  cursor: 'pointer',
                },
              }}
            />
            {/* --- End Google Translate Element Placeholder --- */}
            {/* User Menu */}
            {user && (
              <div>
                <IconButton
                  size="large"
                  aria-label="account of current user"
                  aria-controls="menu-appbar"
                  aria-haspopup="true"
                  onClick={handleMenu}
                  color="inherit"
                >
                  <AccountCircle />
                </IconButton>
                <Menu
                  id="menu-appbar"
                  anchorEl={anchorEl}
                  anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                  keepMounted
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  open={Boolean(anchorEl)}
                  onClose={handleClose}
                >
                  <MenuItem disabled>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Logged in as: {user.username}
                    </Typography>
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#f44336' }}>
                      Logout
                    </Typography>
                  </MenuItem>
                </Menu>
              </div>
            )}
          </Toolbar>
        </AppBar>
    )}
    {/* ================= End AppBar ================= */}


    {/* =================== Sidebar Drawer =================== */}
    {/* Render Drawer only when authenticated */}
    {isAuthenticated && (
        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={toggleDrawer(false)} // Close drawer on clicking outside or pressing Esc
          sx={{
            '& .MuiDrawer-paper': {
              width: 280,
              background: 'rgba(106, 17, 203, 0.8)', // Translucent purple background
              backdropFilter: 'blur(10px)', // Add blur effect
              color: '#ffffff', // Default text color
              boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
            },
          }}
        >
          <Box
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
            role="presentation"
            onKeyDown={toggleDrawer(false)} // Close on Esc
          >
            {/* Spacer to push content below AppBar */}
            <Toolbar />
            {/* Button to start a new session */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddCircleOutlineIcon />}
                onClick={handleNewSession} // Clears the main view
                fullWidth
                sx={{
                  mb: 2,
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #43a047 0%, #388e3c 100%)',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #388e3c 0%, #43a047 100%)',
                  },
                }}
              >
                New Chat / Topic
              </Button>
            </Box>
            <Divider sx={{ mb: 2, borderColor: 'rgba(255, 255, 255, 0.3)' }} />
            {/* History List Area */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2 }}>
              {historyLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 2, color: '#ffffff' }} />}
              {historyError && <Alert severity="error" sx={{ m: 1, backgroundColor: '#f44336', color: '#ffffff' }}>{historyError}</Alert>}
              <List>
                {/* Map over sessionHistory state */}
                {sessionHistory.map((session) => (
                  <ListItem
                    key={session.id}
                    disablePadding
                    sx={{
                      mb: 1,
                      borderRadius: '10px',
                      background: currentSessionId === session.id
                        ? 'rgba(255, 255, 255, 0.2)' // Highlight selected session
                        : 'transparent',
                      color: currentSessionId === session.id ? '#ffffff' : '#e0e0e0', // Adjust text color
                      transition: 'background 0.3s ease, color 0.3s ease',
                      '&:hover': {
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: '#ffffff',
                      },
                    }}
                  >
                    <ListItemButton
                      onClick={() => loadSession(session.id)}
                      sx={{
                        borderRadius: '10px',
                        py: 1,
                        px: 2,
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 'auto', mr: 1.5, color: 'inherit' }}>
                        <HistoryIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={session.topic}
                        primaryTypographyProps={{
                          noWrap: true,
                          variant: 'body2',
                          fontWeight: 'bold',
                        }}
                        secondary={new Date(session.created_at).toLocaleDateString()}
                        secondaryTypographyProps={{
                          variant: 'caption',
                          color: 'inherit',
                        }}
                      />
                      {/* Delete Button */}
                      <ListItemSecondaryAction>
                        <Tooltip title="Delete Session">
                          <IconButton
                            edge="end"
                            aria-label="delete"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            size="small"
                            sx={{
                              color: '#f44336',
                              '&:hover': {
                                color: '#d32f2f',
                              },
                            }}
                          >
                            <DeleteForeverIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>
        </Drawer>
    )}
    {/* ================= End Sidebar Drawer ================= */}


    {/* =================== Routing =================== */}
    <Routes>
      {/* --- Public Routes --- */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* --- Protected Main App Route --- */}
      <Route
        path="/"
        element={
          <ProtectedRoute> {/* Guards the content below */}

            {/* START: Your Existing Main Application UI */}
            {/* This Container holds ALL the content generation, quiz, pdf, etc. */}
            <Container maxWidth="lg">
              <Box sx={{ my: isAuthenticated ? 2 : 4 }}> {/* Adjust margin */}

                {/* Input Section */}
                <Box sx={{ display: 'flex', gap: 2, mb: 4, alignItems: 'center' }}>
                  <TextField
                    fullWidth
                    label="Enter Topic"
                    variant="outlined"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isLoading}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isLoading) handleGetContent();
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #f9f9f9 0%, #e3f2fd 100%)',
                        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
                        '& fieldset': {
                          borderColor: '#6a11cb',
                        },
                        '&:hover fieldset': {
                          borderColor: '#2575fc',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#6a11cb',
                        },
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleGetContent}
                    disabled={isLoading}
                    size="large"
                    sx={{
                      whiteSpace: 'nowrap',
                      borderRadius: '20px',
                      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
                      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.2)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #2575fc 0%, #6a11cb 100%)',
                      },
                    }}
                  >
                    {isLoading ? <CircularProgress size={24} color="inherit" /> : "Get Content"}
                  </Button>
                </Box>

                {/* Loading Indicator */}
                {isLoading && ( <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box> )}
                {/* Error Display */}
                {error && ( <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> )}

                {/* --- Main Content Display Area + Actions --- */}
                {!isLoading && (notes || summary || videos.length > 0) && (
                  <Box sx={{ mt: 2 }}>
                    {/* Grid for Notes/Summary/Videos */}
                    <Grid container spacing={4}>
                      {notes && (
                        <Grid item xs={12} md={8}>
                          <Typography
                            variant="h5"
                            component="h2"
                            gutterBottom
                            sx={{
                              fontWeight: 'bold',
                              color: '#4A90E2',
                              textAlign: 'center',
                              mb: 2,
                            }}
                          >
                            Notes
                          </Typography>
                          <Box
                            sx={{
                              p: 4,
                              background: 'linear-gradient(135deg, #ffffff 0%, #f9f9f9 100%)',
                              borderRadius: '16px',
                              boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.1)',
                              maxHeight: '60vh',
                              overflowY: 'auto',
                              border: '1px solid #e0e0e0',
                              '& pre': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
                            }}
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
                          </Box>
                        </Grid>
                      )}
                      {(summary || videos.length > 0) && (
                        <Grid item xs={12} md={4}>
                          {summary && (
                            <Box sx={{ mb: 3 }}>
                              <Typography
                                variant="h6"
                                component="h3"
                                gutterBottom
                                sx={{
                                  fontWeight: 'bold',
                                  color: '#7B1FA2',
                                  textAlign: 'center',
                                  mb: 2,
                                }}
                              >
                                Summary
                              </Typography>
                              <Box
                                sx={{
                                  p: 3,
                                  background: 'linear-gradient(135deg, #ffffff 0%, #f3e5f5 100%)',
                                  borderRadius: '16px',
                                  boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.1)',
                                  maxHeight: '25vh',
                                  overflowY: 'auto',
                                  border: '1px solid #e0e0e0',
                                  '& pre': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
                                }}
                              >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                              </Box>
                            </Box>
                          )}
                          {videos.length > 0 && (
                            <Box>
                              <Typography
                                variant="h6"
                                component="h3"
                                gutterBottom
                                sx={{
                                  fontWeight: 'bold',
                                  color: '#388E3C',
                                  textAlign: 'center',
                                  mb: 2,
                                }}
                              >
                                Related YouTube Videos
                              </Typography>
                              <Box
                                sx={{
                                  position: 'relative',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                {/* Left Arrow Button */}
                                <IconButton
                                  onClick={() => {
                                    scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                                  }}
                                  sx={{
                                    position: 'absolute',
                                    left: 0,
                                    zIndex: 1,
                                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                    color: '#fff',
                                    '&:hover': {
                                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                    },
                                  }}
                                >
                                  <ArrowBackIos />
                                </IconButton>

                                {/* Scrollable Container */}
                                <Box
                                  ref={scrollRef}
                                  sx={{
                                    display: 'flex',
                                    overflowX: 'auto',
                                    gap: 2,
                                    p: 2,
                                    scrollBehavior: 'smooth',
                                    '&::-webkit-scrollbar': {
                                      height: '8px',
                                    },
                                    '&::-webkit-scrollbar-thumb': {
                                      background: '#888',
                                      borderRadius: '4px',
                                    },
                                    '&::-webkit-scrollbar-thumb:hover': {
                                      background: '#555',
                                    },
                                  }}
                                >
                                  {videos.map((video) => (
                                    <Box
                                      key={video.id || video.url}
                                      sx={{
                                        minWidth: 300,
                                        flexShrink: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        background: 'linear-gradient(135deg, #ffffff 0%, #e8f5e9 100%)',
                                        borderRadius: '16px',
                                        boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.1)',
                                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                        '&:hover': {
                                          transform: 'scale(1.05)',
                                          boxShadow: '0px 12px 24px rgba(0, 0, 0, 0.2)',
                                        },
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          width: '100%',
                                          height: 200,
                                          overflow: 'hidden',
                                          borderRadius: '12px',
                                          mb: 2,
                                        }}
                                      >
                                        <CardMedia
                                          component="img"
                                          sx={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                          }}
                                          image={video.thumbnail}
                                          alt={video.title}
                                        />
                                      </Box>
                                      <Typography
                                        component="div"
                                        variant="body2"
                                        title={video.title}
                                        sx={{
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          display: '-webkit-box',
                                          WebkitLineClamp: '2',
                                          WebkitBoxOrient: 'vertical',
                                          lineHeight: '1.2em',
                                          maxHeight: '2.4em',
                                          fontWeight: 'bold',
                                          color: '#1E88E5',
                                          textAlign: 'center',
                                        }}
                                      >
                                        <Link
                                          href={video.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          underline="hover"
                                          sx={{
                                            color: '#1E88E5',
                                            '&:hover': {
                                              color: '#1565C0',
                                            },
                                          }}
                                        >
                                          {video.title}
                                        </Link>
                                      </Typography>
                                    </Box>
                                  ))}
                                </Box>

                                {/* Right Arrow Button */}
                                <IconButton
                                  onClick={() => {
                                    scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                                  }}
                                  sx={{
                                    position: 'absolute',
                                    right: 0,
                                    zIndex: 1,
                                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                    color: '#fff',
                                    '&:hover': {
                                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                    },
                                  }}
                                >
                                  <ArrowForwardIos />
                                </IconButton>
                              </Box>
                            </Box>
                          )}
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                )}

                {/* Floating Action Buttons for Content Actions */}
                {isAuthenticated && notes && (
                  <Box
                    sx={{
                      position: 'fixed',
                      top: '50%',
                      right: 16,
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      zIndex: 1000,
                    }}
                  >
                    {/* Generate Quiz Button */}
                    <Tooltip title="Generate Quiz" arrow>
                      <Fab
                        color="secondary"
                        aria-label="generate-quiz"
                        onClick={handleGenerateQuiz}
                        disabled={isLoading || quizIsLoading}
                        sx={{
                          background: 'linear-gradient(135deg, #ff9800 0%, #f44336 100%)',
                          transition: 'transform 0.3s ease',
                          '&:hover': {
                            transform: 'scale(1.1)',
                          },
                        }}
                      >
                        {quizIsLoading ? <CircularProgress size={24} color="inherit" /> : <QuizIcon />}
                      </Fab>
                    </Tooltip>

                    {/* Generate Flashcards Button */}
                    <Tooltip title="Generate Flashcards" arrow>
                      <Fab
                        color="success"
                        aria-label="generate-flashcards"
                        onClick={handleGenerateFlashcards}
                        disabled={isLoading || flashcardsLoading}
                        sx={{
                          background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                          transition: 'transform 0.3s ease',
                          '&:hover': {
                            transform: 'scale(1.1)',
                          },
                        }}
                      >
                        {flashcardsLoading ? <CircularProgress size={24} color="inherit" /> : <FlashOnIcon />}
                      </Fab>
                    </Tooltip>

                    {/* Download PDF Button */}
                    <Tooltip title="Download PDF" arrow>
                      <Fab
                        color="primary"
                        aria-label="download-pdf"
                        onClick={handleDownloadPdf}
                        disabled={isLoading || pdfIsLoading}
                        sx={{
                          background: 'linear-gradient(135deg, #2196f3 0%, #1e88e5 100%)',
                          transition: 'transform 0.3s ease',
                          '&:hover': {
                            transform: 'scale(1.1)',
                          },
                        }}
                      >
                        {pdfIsLoading ? <CircularProgress size={24} color="inherit" /> : <PictureAsPdfIcon />}
                      </Fab>
                    </Tooltip>
                  </Box>
                )}

                {/* Quiz Area */}
                {quizQuestions.length > 0 && !quizCompleted && (
                  <Paper
                    elevation={3}
                    sx={{
                      p: 4,
                      mt: 4,
                      background: 'linear-gradient(135deg, #ffffff 0%, #e3f2fd 100%)',
                      borderRadius: 3,
                      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <Typography
                      variant="h5"
                      component="h2"
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        color: '#1976d2',
                        mb: 2,
                      }}
                    >
                      Quiz Time! (Question {currentQuestionIndex + 1} of {quizQuestions.length})
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={((currentQuestionIndex + 1) / quizQuestions.length) * 100}
                      sx={{
                        mb: 3,
                        height: 8,
                        borderRadius: 5,
                        backgroundColor: '#e0e0e0',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: '#1976d2',
                        },
                      }}
                    />
                    <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
                      <FormLabel
                        component="legend"
                        sx={{
                          mb: 2,
                          fontWeight: 'bold',
                          fontSize: '1.2rem',
                          color: '#424242',
                        }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {quizQuestions[currentQuestionIndex]?.question || ''}
                        </ReactMarkdown>
                      </FormLabel>
                      <RadioGroup
                        aria-label="quiz-options"
                        name="quiz-options-group"
                        value={selectedAnswer}
                        onChange={handleAnswerChange}
                      >
                        {(quizQuestions[currentQuestionIndex]?.options || []).map((option, index) => (
                          <FormControlLabel
                            key={index}
                            value={option}
                            control={<Radio />}
                            label={
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {option}
                              </ReactMarkdown>
                            }
                            disabled={showFeedback}
                            sx={{
                              mb: 1,
                              '& .MuiFormControlLabel-label': {
                                fontSize: '1rem',
                              },
                            }}
                          />
                        ))}
                      </RadioGroup>
                    </FormControl>
                    {showFeedback && (
                      <Alert
                        severity={
                          selectedAnswer === quizQuestions[currentQuestionIndex]?.correct_answer
                            ? 'success'
                            : 'error'
                        }
                        sx={{
                          mt: 3,
                          fontSize: '1rem',
                          '& .MuiAlert-message': {
                            display: 'flex',
                            flexDirection: 'column',
                          },
                        }}
                      >
                        {selectedAnswer === quizQuestions[currentQuestionIndex]?.correct_answer
                          ? 'Correct!'
                          : 'Incorrect.'}
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          <strong>Explanation:</strong>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {quizQuestions[currentQuestionIndex]?.explanation || ''}
                          </ReactMarkdown>
                        </Typography>
                      </Alert>
                    )}
                    <Box
                      sx={{
                        mt: 4,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Button
                        variant="contained"
                        onClick={handleSubmitAnswer}
                        disabled={!selectedAnswer || showFeedback}
                        sx={{
                          backgroundColor: '#1976d2',
                          '&:hover': {
                            backgroundColor: '#1565c0',
                          },
                        }}
                      >
                        Submit Answer
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleNextQuestion}
                        disabled={!showFeedback}
                        sx={{
                          backgroundColor: '#43a047',
                          '&:hover': {
                            backgroundColor: '#388e3c',
                          },
                        }}
                      >
                        {currentQuestionIndex < quizQuestions.length - 1
                          ? 'Next Question'
                          : 'Finish Quiz'}
                      </Button>
                    </Box>
                  </Paper>
                )}

                {quizCompleted && (
                  <Paper elevation={3} sx={{ p: 3, mt: 4, textAlign: 'center', background: '#f9f9f9', borderRadius: 2 }}>
                    <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>Quiz Completed!</Typography>
                    <Typography variant="h6">
                      Your Final Score: {score} / {quizQuestions.length}
                    </Typography>
                    {/* Replace "Retake Quiz" with "Regenerate Quiz" */}
                    <Button
                      variant="contained"
                      color="secondary" // Or keep primary, or use 'info'
                      onClick={handleRegenerateQuiz} // Call the regenerate handler
                      disabled={quizIsLoading || !notes || !currentSessionId} // Disable if conditions aren't met
                      sx={{ mt: 2 }}
                      startIcon={quizIsLoading ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                      Regenerate Quiz with New Questions
                    </Button>
                    {/* You can add another button here if you still want a "Clear/Back to Notes" option */}
                    {
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setQuizQuestions([]);
                        setQuizCompleted(false);
                        // any other state reset needed to go "back"
                      }}
                      sx={{ mt: 2, ml: 1 }} // Add margin-left if next to another button
                    >
                      Back to Notes
                    </Button>
                    }
                  </Paper>
                )}

                {/* Flashcard Viewer Area */}
                {!flashcardsLoading && flashcards.length > 0 && (
                  <Paper
                    elevation={3}
                    sx={{
                      p: 4,
                      mt: 4,
                      background: 'linear-gradient(135deg, #ffffff 0%, #f1f8e9 100%)',
                      borderRadius: 3,
                      boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <Typography
                      variant="h5"
                      component="h2"
                      gutterBottom
                      align="center"
                      sx={{
                        fontWeight: 'bold',
                        color: '#388e3c',
                        mb: 3,
                      }}
                    >
                      Flashcards ({currentCardIndex + 1} / {flashcards.length})
                    </Typography>
                    <Card
                      variant="outlined"
                      sx={{
                        minHeight: 200,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 3,
                        cursor: 'pointer',
                        backgroundColor: isFlipped ? '#e8f5e9' : '#fffde7',
                        textAlign: 'center',
                        mb: 3,
                        borderRadius: 3,
                        boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
                        transition: 'transform 0.3s ease',
                        '&:hover': {
                          transform: 'scale(1.02)',
                        },
                      }}
                      onClick={handleFlipCard}
                    >
                      <CardContent>
                        <Typography
                          variant={isFlipped ? 'body1' : 'h6'}
                          sx={{
                            fontWeight: 'bold',
                            color: isFlipped ? '#388e3c' : '#f57f17',
                          }}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {isFlipped
                              ? flashcards[currentCardIndex]?.definition || ''
                              : flashcards[currentCardIndex]?.term || ''}
                          </ReactMarkdown>
                        </Typography>
                      </CardContent>
                    </Card>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 3,
                      }}
                    >
                      <Button
                        onClick={handlePrevCard}
                        disabled={currentCardIndex === 0}
                        sx={{
                          backgroundColor: '#1976d2',
                          color: '#fff',
                          '&:hover': {
                            backgroundColor: '#1565c0',
                          },
                        }}
                      >
                        Previous
                      </Button>
                      <Button
                        onClick={handleFlipCard}
                        sx={{
                          backgroundColor: '#f57f17',
                          color: '#fff',
                          '&:hover': {
                            backgroundColor: '#ef6c00',
                          },
                        }}
                      >
                        Flip Card
                      </Button>
                      <Button
                        onClick={handleNextCard}
                        disabled={currentCardIndex === flashcards.length - 1}
                        sx={{
                          backgroundColor: '#43a047',
                          color: '#fff',
                          '&:hover': {
                            backgroundColor: '#388e3c',
                          },
                        }}
                      >
                        Next
                      </Button>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                      <Button
                        variant="outlined"
                        color="success"
                        onClick={handleDownloadFlashcards}
                        sx={{
                          borderColor: '#43a047',
                          color: '#43a047',
                          '&:hover': {
                            backgroundColor: '#e8f5e9',
                          },
                        }}
                      >
                        Download All Flashcards (CSV)
                      </Button>
                    </Box>
                  </Paper>
                )}

                {/* Floating Action Button for Study Planner */}
                {isAuthenticated && (
                  <Tooltip title="Open Study Planner" arrow>
                    <Fab
                      color="primary"
                      aria-label="study-planner"
                      onClick={handleOpenPlanner}
                      sx={{
                        position: 'fixed',
                        bottom: 16,
                        right: 16,
                        zIndex: 1000,
                        background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
                        transition: 'transform 0.3s ease',
                        '&:hover': {
                          transform: 'scale(1.1)',
                        },
                      }}
                    >
                      <AddIcon />
                    </Fab>
                  </Tooltip>
                )}

                {/* Study Planner Modal */}
                <Dialog open={isPlannerOpen} onClose={handleClosePlanner} fullWidth maxWidth="sm">
                  <DialogTitle>
                    <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                      <EventNoteIcon sx={{ mr: 1 }} /> Study Planner
                    </Typography>
                  </DialogTitle>
                  <DialogContent dividers>
                    <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="body1" sx={{ mr: 1 }}>
                        Schedule review for "<strong>{topic || 'Current Topic'}</strong>":
                      </Typography>
                      <DatePicker
                        label="Review Date"
                        value={newPlanDate}
                        onChange={(newValue) => setNewPlanDate(newValue)}
                        slotProps={{ textField: { size: 'small' } }}
                        format="yyyy-MM-dd"
                        sx={{ minWidth: 180 }}
                      />
                      <Button
                        variant="contained"
                        color="info"
                        onClick={handleAddPlanEntry}
                        disabled={!topic || !newPlanDate || planLoading}
                      >
                        Add to Plan
                      </Button>
                    </Box>
                    {planLoading && <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 2 }} />}
                    {planError && <Alert severity="error" sx={{ mb: 2 }}>{planError}</Alert>}
                    <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 'bold' }}>
                      Upcoming Reviews:
                    </Typography>
                    {studyPlanEntries.length === 0 && !planLoading && (
                      <Typography variant="body2" color="text.secondary">
                        No reviews scheduled yet.
                      </Typography>
                    )}
                    <List
                      dense
                      sx={{
                        maxHeight: '30vh',
                        overflowY: 'auto',
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                      }}
                    >
                      {studyPlanEntries.map((entry) => (
                        <ListItem
                          key={entry.id}
                          secondaryAction={
                            <IconButton
                              edge="end"
                              aria-label="delete"
                              onClick={() => handleDeletePlanEntry(entry.id)}
                              disabled={planLoading}
                            >
                              <DeleteIcon />
                            </IconButton>
                          }
                        >
                          <ListItemText
                            primary={entry.topic}
                            secondary={`Review on: ${entry.review_date}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={handleClosePlanner} color="primary">
                      Close
                    </Button>
                  </DialogActions>
                </Dialog>

                {/* Floating Action Button for Chatbot */}
                {isAuthenticated && notes && (
                  <Tooltip title="Ask AI about Notes" arrow>
                    <Fab
                      color="secondary"
                      aria-label="chatbot"
                      onClick={handleOpenChat}
                      sx={{
                        position: 'fixed',
                        bottom: 16,
                        left: 16,
                        zIndex: 1000,
                        background: 'linear-gradient(135deg, #ff9800 0%, #f44336 100%)',
                        transition: 'transform 0.3s ease',
                        '&:hover': {
                          transform: 'scale(1.1)',
                        },
                      }}
                    >
                      <ChatIcon />
                    </Fab>
                  </Tooltip>
                )}

                {/* Chatbot Modal */}
                <Dialog open={isChatOpen} onClose={handleCloseChat} fullWidth maxWidth="sm">
                  <DialogTitle>
                    <Typography variant="h6" component="div" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                      <ChatIcon sx={{ mr: 1 }} /> Ask AI about these Notes
                    </Typography>
                  </DialogTitle>
                  <DialogContent dividers>
                    <Box sx={{ height: '40vh', display: 'flex', flexDirection: 'column' }}>
                      <List sx={{ flexGrow: 1, overflowY: 'auto', p: 2 }}>
                        {chatHistory.map((message, index) => (
                          <ListItem
                            key={index}
                            sx={{
                              display: 'flex',
                              justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                            }}
                          >
                            <Paper
                              elevation={1}
                              sx={{
                                p: 1.5,
                                bgcolor: message.sender === 'user' ? 'primary.light' : 'grey.200',
                                borderRadius: message.sender === 'user' ? '20px 20px 5px 20px' : '20px 20px 20px 5px',
                                maxWidth: '75%',
                              }}
                            >
                              {message.sender === 'ai' ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                              ) : (
                                <ListItemText primary={message.text} sx={{ wordBreak: 'break-word' }} />
                              )}
                            </Paper>
                          </ListItem>
                        ))}
                        <div ref={chatMessagesEndRef} />
                      </List>
                      <Divider />
                      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', bgcolor: 'background.paper' }}>
                        <InputBase
                          sx={{ ml: 1, flex: 1 }}
                          placeholder="Ask a question about the notes..."
                          value={chatInput}
                          onChange={handleChatInputChange}
                          disabled={chatIsLoading}
                          multiline
                          maxRows={3}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendChatMessage();
                            }
                          }}
                        />
                        <IconButton
                          color="primary"
                          sx={{ p: '10px' }}
                          aria-label="send message"
                          onClick={handleSendChatMessage}
                          disabled={chatIsLoading || !chatInput.trim()}
                        >
                          {chatIsLoading ? <CircularProgress size={24} /> : <SendIcon />}
                        </IconButton>
                      </Box>
                      {chatError && <Alert severity="error" sx={{ m: 1 }}>{chatError}</Alert>}
                    </Box>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={handleCloseChat} color="primary">
                      Close
                    </Button>
                  </DialogActions>
                </Dialog>

              </Box>
            </Container>
            {/* END: Your Existing Main Application UI */}

          </ProtectedRoute>
        }
      /> {/* End Protected Main App Route */}

      {/* --- Catch-all / Redirect Route --- */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />

    </Routes>
    {/* ================= End Routing ================= */}

  </React.Fragment>
);
}