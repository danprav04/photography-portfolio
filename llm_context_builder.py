import os
import gitignore_parser

def get_ignored_patterns(gitignore_path):
    """Parses the .gitignore file and returns the patterns."""
    if not os.path.exists(gitignore_path):
        return []
    with open(gitignore_path, 'r') as f:
        return f.read().splitlines()

def is_ignored(path, ignore_patterns):
    """Checks if a path matches any of the gitignore patterns."""
    return any(pattern.match(path) for pattern in ignore_patterns)

def build_llm_context(project_root='.', output_file='llm_context.txt'):
    """
    Combines relevant project files into a single file for LLM context,
    respecting .gitignore rules.
    """
    gitignore_path = os.path.join(project_root, '.gitignore')
    base_path = os.path.abspath(project_root)
    
    # Use gitignore_parser to handle complex .gitignore rules
    if os.path.exists(gitignore_path):
        matches = gitignore_parser.parse_gitignore(gitignore_path, base_path)
    else:
        matches = lambda x: False

    # Standard directories and files to always ignore
    default_ignored_dirs = {'.git', '.github', '__pycache__', 'node_modules', 'venv', '.venv'}
    default_ignored_files = {'.DS_Store', 'llm_context.txt'}

    with open(output_file, 'w', encoding='utf-8') as outfile:
        for root, dirs, files in os.walk(project_root, topdown=True):
            # Exclude default ignored directories
            dirs[:] = [d for d in dirs if d not in default_ignored_dirs]
            
            # Filter out ignored directories based on .gitignore
            dirs[:] = [d for d in dirs if not matches(os.path.abspath(os.path.join(root, d)))]

            for file in files:
                if file in default_ignored_files:
                    continue

                file_path = os.path.join(root, file)
                abs_file_path = os.path.abspath(file_path)

                if not matches(abs_file_path):
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as infile:
                            content = infile.read()
                            
                        relative_path = os.path.relpath(file_path, project_root)
                        
                        outfile.write(f"--- File: {relative_path} ---\n\n")
                        outfile.write(content)
                        outfile.write("\n\n")
                    except Exception as e:
                        print(f"Error reading file {file_path}: {e}")

    print(f"Project context has been successfully combined into {output_file}")

if __name__ == '__main__':
    # Before running, make sure you have the gitignore_parser library installed:
    # pip install gitignore_parser
    build_llm_context()