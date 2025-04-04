// services/documentProcessor.js

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PDFExtract } = require('pdf.js-extract');
const mammoth = require('mammoth');
const natural = require('natural');
const db = require('../database/db');

// NLP tokenizer for processing text
const tokenizer = new natural.WordTokenizer();

// PDF extractor
const pdfExtract = new PDFExtract();

/**
 * Process an uploaded document and extract its content
 */
async function processDocument(filePath, originalName, documentId, userId) {
  try {
    // Extract text based on file type
    const fileExtension = path.extname(originalName).toLowerCase();
    let extractedText = '';
    
    if (fileExtension === '.pdf') {
      const pdfData = await pdfExtract.extract(filePath);
      extractedText = pdfData.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n');
    } else if (fileExtension === '.docx' || fileExtension === '.doc') {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (fileExtension === '.txt') {
      extractedText = fs.readFileSync(filePath, 'utf8');
    }
    
    // Process the document text (identify legal terms, clauses, etc.)
    const analysis = await analyzeDocument(extractedText);
    
    // Store document in database
    const document = {
      id: documentId,
      userId,
      originalName,
      filePath,
      uploadDate: new Date(),
      extractedText,
      analysis
    };
    
    await db.documents.insert(document);
    
    return {
      id: document.id,
      originalName: document.originalName,
      uploadDate: document.uploadDate,
      summary: analysis.summary
    };
  } catch (error) {
    console.error('Document processing error:', error);
    throw new Error('Failed to process document');
  }
}

/**
 * Analyze document text and identify important elements
 */
async function analyzeDocument(text) {
  // Simple placeholder for actual NLP analysis
  // In a real implementation, you would use more sophisticated NLP techniques
  
  // Tokenize text
  const tokens = tokenizer.tokenize(text);
  
  // Identify potential legal terms (simplified example)
  const legalTerms = identifyLegalTerms(text);
  
  // Identify key clauses (simplified example)
  const keyClauses = identifyKeyClauses(text);
  
  // Generate summary (simplified example)
  const summary = generateSummary(text);
  
  return {
    legalTerms,
    keyClauses,
    summary,
    wordCount: tokens.length,
    complexity: calculateComplexity(text)
  };
}

/**
 * Identify legal terms in text
 */
function identifyLegalTerms(text) {
  // This is a simplified example
  // In a real implementation, use a legal terminology database or ML model
  const commonLegalTerms = [
    'hereinafter', 'notwithstanding', 'pursuant', 'aforementioned',
    'covenant', 'jurisdiction', 'liability', 'indemnity', 'termination',
    'whereas', 'hereunder', 'henceforth', 'arbitration', 'breach'
  ];
  
  const terms = [];
  const lowerText = text.toLowerCase();
  
  commonLegalTerms.forEach(term => {
    const index = lowerText.indexOf(term);
    if (index !== -1) {
      // Get the surrounding context
      const start = Math.max(0, index - 50);
      const end = Math.min(lowerText.length, index + term.length + 50);
      const context = text.substring(start, end);
      
      terms.push({
        term,
        context,
        position: index
      });
    }
  });
  
  return terms;
}

/**
 * Identify key clauses in text
 */
function identifyKeyClauses(text) {
  // This is a simplified example
  // In a real implementation, use more sophisticated NLP techniques
  const keyClauseIndicators = [
    'shall not', 'must not', 'is prohibited', 'warranty', 'represents and warrants',
    'limitation of liability', 'indemnification', 'confidential information',
    'termination', 'governing law', 'dispute resolution'
  ];
  
  const clauses = [];
  const paragraphs = text.split(/\n\s*\n/);
  
  paragraphs.forEach((paragraph, paragraphIndex) => {
    keyClauseIndicators.forEach(indicator => {
      if (paragraph.toLowerCase().includes(indicator.toLowerCase())) {
        clauses.push({
          indicator,
          paragraph,
          paragraphIndex,
          importance: calculateImportance(indicator)
        });
      }
    });
  });
  
  return clauses;
}

/**
 * Calculate importance score of a clause
 */
function calculateImportance(indicator) {
  // Assign importance based on term (simplified)
  const highImportance = ['limitation of liability', 'indemnification', 'termination'];
  const mediumImportance = ['warranty', 'confidential information', 'dispute resolution'];
  
  if (highImportance.some(term => indicator.includes(term))) {
    return 'high';
  } else if (mediumImportance.some(term => indicator.includes(term))) {
    return 'medium';
  }
  return 'normal';
}

/**
 * Generate a summary of the document
 */
function generateSummary(text) {
  // This is a simplified example
  // In a real implementation, use more sophisticated summarization techniques
  
  // Extract first few sentences as a simple summary
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const introSentences = sentences.slice(0, 3).join(' ');
  
  return {
    brief: introSentences,
    documentType: detectDocumentType(text),
    estimatedReadingTime: Math.ceil(text.split(' ').length / 200) // Assuming 200 words per minute
  };
}

/**
 * Detect document type
 */
function detectDocumentType(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('terms of service') || lowerText.includes('terms and conditions')) {
    return 'Terms of Service';
  } else if (lowerText.includes('privacy policy')) {
    return 'Privacy Policy';
  } else if (lowerText.includes('non-disclosure') || lowerText.includes('confidentiality agreement')) {
    return 'Non-Disclosure Agreement';
  } else if (lowerText.includes('employment agreement') || lowerText.includes('employment contract')) {
    return 'Employment Contract';
  } else if (lowerText.includes('license agreement')) {
    return 'License Agreement';
  } else {
    return 'Legal Document';
  }
}

/**
 * Calculate text complexity
 */
function calculateComplexity(text) {
  // Simple readability calculation (approximate Flesch reading ease)
  const words = text.split(/\s+/).length;
  const sentences = (text.match(/[.!?]+/g) || []).length;
  const syllables = estimateSyllables(text);
  
  if (sentences === 0) return 'High';
  
  const wordsPerSentence = words / sentences;
  const syllablesPerWord = syllables / words;
  
  const readingEase = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
  
  if (readingEase > 90) return 'Very Easy';
  if (readingEase > 80) return 'Easy';
  if (readingEase > 70) return 'Fairly Easy';
  if (readingEase > 60) return 'Standard';
  if (readingEase > 50) return 'Fairly Difficult';
  if (readingEase > 30) return 'Difficult';
  return 'Very Difficult';
}

/**
 * Estimate syllable count (simplified)
 */
function estimateSyllables(text) {
  const words = text.toLowerCase().split(/\s+/);
  let count = 0;
  
  words.forEach(word => {
    // Count vowel groups as syllables (simplified)
    const vowelGroups = word.match(/[aeiouy]+/g);
    if (vowelGroups) {
      count += vowelGroups.length;
    }
  });
  
  return count;
}

/**
 * Get documents for a specific user
 */
async function getUserDocuments(userId) {
  try {
    const documents = await db.documents.find({ userId });
    
    return documents.map(doc => ({
      id: doc.id,
      originalName: doc.originalName,
      uploadDate: doc.uploadDate,
      summary: doc.analysis.summary
    }));
  } catch (error) {
    console.error('Error fetching user documents:', error);
    throw new Error('Failed to retrieve documents');
  }
}

/**
 * Get a single document with its full analysis
 */
async function getDocumentWithAnalysis(documentId, userId) {
  try {
    const document = await db.documents.findOne({ id: documentId, userId });
    
    if (!document) {
      return null;
    }
    
    return {
      id: document.id,
      originalName: document.originalName,
      uploadDate: document.uploadDate,
      analysis: document.analysis,
      extractedText: document.extractedText
    };
  } catch (error) {
    console.error('Error fetching document:', error);
    throw new Error('Failed to retrieve document');
  }
}

module.exports = {
  processDocument,
  getUserDocuments,
  getDocumentWithAnalysis
};