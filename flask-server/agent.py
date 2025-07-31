import os
import json
from typing import Dict, Tuple
from openai import OpenAI
from exa_py import Exa
from dotenv import load_dotenv

load_dotenv()

class NewsAgent:
    """AI News Agent with OpenAI Assistants API"""
    
    def __init__(self):
        """Initialize the agent with OpenAI client"""
        self.api_key = os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        self.exa_api_key = os.getenv('EXA_API_KEY')
        if not self.exa_api_key:
            raise ValueError("EXA_API_KEY environment variable is required")
        
        # Create client with v2 headers
        self.client = OpenAI(
            api_key=self.api_key,
            default_headers={"OpenAI-Beta": "assistants=v2"}
        )
        
        # Initialize Exa client
        self.exa = Exa(self.exa_api_key)
        
        self.model = "gpt-4.1-nano"
        self.assistant_id = None
        self.thread_id = None
        
        # Preference collection questions
        self.preference_questions = [
            {
                "key": "tone_of_voice",
                "question": "Hi, before we begin, please answer some questions. \nWhat's your preferred tone of voice? (formal, casual, enthusiastic)",
                "description": "Preferred communication style"
            },
            {
                "key": "response_format", 
                "question": "How do you like information presented? (bullet points, paragraphs)",
                "description": "Response format preference"
            },
            {
                "key": "language",
                "question": "What's your preferred language? (English, Spanish, etc.)",
                "description": "Language preference"
            },
            {
                "key": "interaction_style",
                "question": "What's your preferred interaction style? (concise, detailed)",
                "description": "Level of detail preference"
            },
            {
                "key": "news_topics",
                "question": "What news topics interest you most? (technology, sports, politics, etc.)",
                "description": "Preferred news topics"
            }
        ]
    
    def _build_system_prompt(self, preferences: Dict) -> str:
        """Build system prompt with user preferences"""
        return f"""You are a helpful AI news agent. 

User Preferences:
- Tone of Voice: {preferences.get('tone_of_voice', 'not specified')}: Always format your responses in this tone of voice.
- Response Format: {preferences.get('response_format', 'not specified')}: Ensure to format all your responses in this format.
- Language: {preferences.get('language', 'not specified')}: Always respond in this language.
- Interaction Style: {preferences.get('interaction_style', 'not specified')}: Always respond in this interaction style.
- Preferred News Topics: {preferences.get('news_topics', 'not specified')}: Use these preferred news topics to craft queries when searching for news articles unless explicitly specified otherwise.

You have access to tools for:
- Fetching the latest news articles on a given topic (search_news)
- Summarizing fetched news articles to provide concise information to the user (summarize_article)

Unless the user asks for a summary, or the information in a concise manner, use the search_news tool to fetch the latest news articles on a given topic, and simply return the results in appropriate formatting. 
Remember to match their tone, format, language, and interaction style preferences."""

    def _get_or_create_assistant(self, preferences: Dict) -> str:
        """Create or get assistant with current preferences"""
        # Build system prompt with user preferences
        system_prompt = self._build_system_prompt(preferences)
        
        # Check if we need to create a new assistant or update existing one
        if self.assistant_id is None:
            # Create new assistant with tools
            assistant = self.client.beta.assistants.create(
                name="News Agent",
                instructions=system_prompt,
                model=self.model,
                tools=[
                    {"type": "function", "function": {
                        "name": "search_news",
                        "description": "Search for news articles on a specific topic",
                        "strict": True,
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string", 
                                    "description": "The search query for news articles"
                                },
                            },
                            "additionalProperties": False,
                            "required": ["query"]
                        }
                    }},
                    {"type": "function", "function": {
                        "name": "summarize_article",
                        "description": "Summarize a news article",
                        "strict": True,
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "article_content": {
                                    "type": "string", 
                                    "description": "The full content of the article to summarize"
                                }
                            },
                            "additionalProperties": False,
                            "required": ["article_content"]
                        }
                    }}
                ]
            )
            self.assistant_id = assistant.id
            print(f"Created new assistant with ID: {assistant.id}")
        else:
            # Check if we need to update the assistant
            current_assistant = self.client.beta.assistants.retrieve(self.assistant_id)
            if current_assistant.instructions != system_prompt:
                # Update assistant
                self.client.beta.assistants.update(
                    assistant_id=self.assistant_id,
                    instructions=system_prompt
                )
                print(f"Updated assistant {self.assistant_id} with new system prompt")
        
        return self.assistant_id

    def _create_thread(self) -> str:
        """Create a new thread"""
        thread = self.client.beta.threads.create()
        self.thread_id = thread.id
        print(f"Created new thread with ID: {thread.id}")
        return self.thread_id

    def process_message(self, thread_id: str, user_message: str, preferences: Dict = None) -> Tuple[str, Dict]:
        """
        Process a user message and return agent response
        
        Args:
            thread_id: OpenAI thread identifier
            user_message: The user's message
            preferences: User preferences dict
            
        Returns:
            Tuple of (agent_response, session_data)
        """
        try:
            return self._handle_assistant_conversation(thread_id, user_message, preferences)
                
        except Exception as e:
            error_message = f"I apologize, but I encountered an error: {str(e)}"
            return error_message, {"error": str(e)}
    
    def _handle_assistant_conversation(self, thread_id: str, user_message: str, preferences: Dict) -> Tuple[str, Dict]:
        """Handle conversation using OpenAI Assistants API v2"""
        try:
            # Create or get assistant
            assistant_id = self._get_or_create_assistant(preferences)
            
            # Create or get thread
            if not thread_id:
                thread_id = self._create_thread()
            
            # Add message to thread
            self.client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=user_message
            )
            
            # Run the assistant with polling
            run = self.client.beta.threads.runs.create_and_poll(
                thread_id=thread_id,
                assistant_id=assistant_id
            )
            
            # Handle tool calls if required
            if run.status == 'requires_action':
                tool_outputs = []
                
                # Loop through each tool call
                for tool in run.required_action.submit_tool_outputs.tool_calls:
                    tool_output = self._execute_tool_call(tool)
                    tool_outputs.append({
                        "tool_call_id": tool.id,
                        "output": tool_output
                    })
                
                # Submit all tool outputs at once
                if tool_outputs:
                    try:
                        run = self.client.beta.threads.runs.submit_tool_outputs_and_poll(
                            thread_id=thread_id,
                            run_id=run.id,
                            tool_outputs=tool_outputs
                        )
                        print(f"Tool outputs submitted successfully for {len(tool_outputs)} tools.")
                    except Exception as e:
                        print(f"Failed to submit tool outputs: {e}")
                        return f"Error submitting tool outputs: {str(e)}", {
                            "assistant_id": assistant_id,
                            "thread_id": thread_id,
                            "error": str(e)
                        }
            
            if run.status == 'completed':
                # Get the response
                messages = self.client.beta.threads.messages.list(thread_id=thread_id)
                if messages.data and len(messages.data) > 0:
                    latest_message = messages.data[0]
                    if latest_message.content and len(latest_message.content) > 0:
                        assistant_message = latest_message.content[0].text.value
                        
                        return assistant_message, {
                            "assistant_id": assistant_id,
                            "thread_id": thread_id,
                            "preferences": preferences,
                            "preferences_complete": True
                        }
                    else:
                        return "I apologize, but I couldn't generate a response.", {
                            "assistant_id": assistant_id,
                            "thread_id": thread_id,
                            "error": "No content in response"
                        }
                else:
                    return "I apologize, but I couldn't retrieve the response.", {
                        "assistant_id": assistant_id,
                        "thread_id": thread_id,
                        "error": "No messages in response"
                    }
            else:
                error_message = f"Assistant run failed with status: {run.status}"
                return error_message, {
                    "assistant_id": assistant_id,
                    "thread_id": thread_id,
                    "error": error_message
                }
                
        except Exception as e:
            error_message = f"Error in assistant conversation: {str(e)}"
            return error_message, {"error": error_message}
    
    def _execute_tool_call(self, tool) -> str:
        """Execute a tool call and return the result"""
        function_name = tool.function.name
        try:
            arguments = json.loads(tool.function.arguments)
        except json.JSONDecodeError:
            return json.dumps({"error": "Invalid JSON in tool arguments"})
        
        try:
            if function_name == "search_news":
                query = arguments.get("query", "")
                
                # Use Exa API to search for news
                return self._search_news_with_exa(query)
                
            elif function_name == "summarize_article":
                article_content = arguments.get("article_content", "")
                
                # Use OpenAI to summarize the article
                return self._summarize_article_with_openai(article_content)
                
            else:
                return json.dumps({
                    "status": "error", 
                    "error": f"Unknown function: {function_name}"
                })
                
        except Exception as e:
                         return json.dumps({
                 "status": "error", 
                 "error": str(e), 
                 "function": function_name
             })
    
    def _search_news_with_exa(self, query: str) -> str:
        """Exa AI News Fetcher: Fetches the latest news articles on a given topic using the Exa API"""
        try:
            # Search for news articles using Exa API
            results = self.exa.search_and_contents(
                query,
                type="auto",
                category="news",
                text=True,
            )

            # Format results for the assistant
            formatted_results = []
            for result in results.results:
                formatted_result = {
                    "id": result.id,
                    "title": result.title,
                    "url": result.url,
                    "publishedDate": result.published_date,
                    "author": result.author,
                    "text": result.text,
                }
                formatted_results.append(formatted_result)
            
            return json.dumps({
                "status": "success",
                "results": formatted_results
            })
            
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to search news with Exa API: {str(e)}",
            })
    
    def _summarize_article_with_openai(self, article_content: str) -> str:
        """News Summarizer: Summarizes article content using OpenAI chat completion"""
        try:          
            # Fixed prompt for summarization
            system_prompt = f"""You are a professional news summarizer. Your task is to create a clear, accurate, and concise summary of the provided article content.

Guidelines:
- Focus on the key facts, main points, and important details
- Maintain objectivity and avoid personal opinions
- Preserve the essential information and context
- Use clear, accessible language"""

            user_prompt = f"Please summarize the following article content:\n\n{article_content}"
            
            # Use OpenAI chat completion for summarization
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",  # Use a simpler model for summarization
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3  # Lower temperature for more consistent summaries
            )
            
            summary = response.choices[0].message.content.strip()
            
            return json.dumps({
                "status": "success",
                "summary": summary,
            })
            
        except Exception as e:
            return json.dumps({
                "status": "error",
                "error": f"Failed to summarize article: {str(e)}",
            })
    

# Global agent instance
news_agent = NewsAgent()