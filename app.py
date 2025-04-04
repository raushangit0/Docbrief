import os
import sqlite3
from datetime import datetime
from werkzeug.utils import secure_filename
import google.generativeai as genai
from flask import Flask, render_template, request, redirect, url_for, flash, session, send_from_directory
import PyPDF2
import docx

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB limit
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'txt', 'docx'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

GEMINI_API_KEY = "add-gemini-api-key" # Gemini api add krna h yaha
genai.configure(api_key=GEMINI_API_KEY)

def get_db_connection():
    conn = sqlite3.connect('docbrief.db')
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            upload_date TIMESTAMP NOT NULL,
            summary TEXT,
            important_clauses TEXT
        )
    ''')
    conn.commit()
    conn.close()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def extract_text(file_path):
    file_extension = file_path.rsplit('.', 1)[1].lower()
    
    if file_extension == 'txt':
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    
    elif file_extension == 'pdf':
        text = ""
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page_num in range(len(pdf_reader.pages)):
                text += pdf_reader.pages[page_num].extract_text()
        return text
    
    elif file_extension == 'docx':
        doc = docx.Document(file_path)
        return "\n".join([paragraph.text for paragraph in doc.paragraphs])
    
    return ""

def analyze_document(text):
    prompt = f"""
    Analyze the following legal document:
    
    {text[:10000]}  # Limiting text length for API limits
    
    Please provide the following:
    1. A plain language summary that removes legal jargon
    2. A list of important clauses that parties should pay attention to, with explanations of their significance
    
    Format your response as simple text with clear section headings, not as JSON.
    """
    
    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content(prompt)
    
    summary = "Summary not available"
    important_clauses = "No important clauses identified"
    
    try:
        response_text = response.text
        
        if "Plain Language Summary" in response_text and "Important Clauses" in response_text:
            parts = response_text.split("Important Clauses", 1)
            summary = parts[0].replace("Plain Language Summary", "").strip()
            important_clauses = "<h4>Important Clauses</h4>" + parts[1].strip()
        else:
            lines = response_text.strip().split('\n')
            
            summary_lines = []
            clauses_lines = []
            
            in_summary = True
            for line in lines:
                if in_summary and ('clause' in line.lower() or 'important' in line.lower()):
                    in_summary = False
                
                if in_summary:
                    summary_lines.append(line)
                else:
                    clauses_lines.append(line)
            
            if summary_lines:
                summary = "\n".join(summary_lines).strip()
            if clauses_lines:
                important_clauses = "<h4>Important Clauses</h4>\n" + "\n".join(clauses_lines).strip()
        
        summary = summary.replace('```json', '').replace('```', '')
        important_clauses = important_clauses.replace('```json', '').replace('```', '')
        
        summary = summary.replace('\n', '<br>')
        important_clauses = important_clauses.replace('\n', '<br>')
        
    except Exception as e:
        print(f"Error processing AI response: {e}")
        summary = "Error processing document. Please try again."
        important_clauses = "Error processing document. Please try again."
    
    return summary, important_clauses

@app.context_processor
def inject_current_year():
    return {'current_year': datetime.now().year}

@app.route('/')
def index():
    conn = get_db_connection()
    documents = conn.execute('SELECT * FROM documents ORDER BY upload_date DESC').fetchall()
    conn.close()
    return render_template('index.html', documents=documents)

@app.route('/upload', methods=['POST'])
def upload_document():
    if 'document' not in request.files:
        flash('No file part')
        return redirect(request.url)
    
    file = request.files['document']
    
    if file.filename == '':
        flash('No selected file')
        return redirect(request.url)
    
    if file and allowed_file(file.filename):
        original_filename = file.filename
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        unique_filename = f"{timestamp}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(file_path)
        
        text = extract_text(file_path)
        
        summary, important_clauses = analyze_document(text)
        
        conn = get_db_connection()
        conn.execute(
            'INSERT INTO documents (filename, original_filename, upload_date, summary, important_clauses) VALUES (?, ?, ?, ?, ?)',
            (unique_filename, original_filename, datetime.now(), summary, important_clauses)
        )
        conn.commit()
        conn.close()
        
        flash('Document uploaded and analyzed successfully!')
        return redirect(url_for('index'))
    
    flash('File type not allowed')
    return redirect(request.url)

@app.route('/download_summary/<int:doc_id>')
def download_summary(doc_id):
    conn = get_db_connection()
    document = conn.execute('SELECT * FROM documents WHERE id = ?', (doc_id,)).fetchone()
    conn.close()
    
    if not document:
        flash('Document not found')
        return redirect(url_for('index'))
    
    original_filename = document['original_filename']
    base_name = original_filename.rsplit('.', 1)[0]
    summary_filename = f"{base_name}_summary.txt"
    
    import re
    
    summary_text = re.sub('<.*?>', '', document['summary'])
    important_clauses_text = re.sub('<.*?>', '', document['important_clauses'])
    
    summary_text = summary_text.replace('<br>', '\n').replace('&nbsp;', ' ')
    important_clauses_text = important_clauses_text.replace('<br>', '\n').replace('&nbsp;', ' ')
    
    content = f"""DOCUMENT ANALYSIS FOR: {original_filename}
Generated by DocBrief on {document['upload_date']}

=============================================
PLAIN LANGUAGE SUMMARY
=============================================
{summary_text}

=============================================
IMPORTANT CLAUSES
=============================================
{important_clauses_text}
"""
    
    from flask import Response
    response = Response(
        content,
        mimetype="text/plain",
        headers={"Content-Disposition": f"attachment;filename={summary_filename}"}
    )
    
    return response

@app.route('/document/<int:doc_id>')
def view_document(doc_id):
    conn = get_db_connection()
    document = conn.execute('SELECT * FROM documents WHERE id = ?', (doc_id,)).fetchone()
    conn.close()
    
    if document:
        return render_template('document.html', document=document)
    
    flash('Document not found')
    return redirect(url_for('index'))

@app.route('/download/<filename>')
def download_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    init_db()
    app.run(debug=True)