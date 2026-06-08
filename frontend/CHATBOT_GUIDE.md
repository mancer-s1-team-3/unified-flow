# Enhanced Chatbot with ASI:One Integration

## Overview

The enhanced chatbot is now powered by ASI:One API, providing intelligent, context-aware responses for token vesting and stream management on the Unified Flow platform.

## Features

### 🤖 AI-Powered Responses
- **ASI:One Integration**: Leverages advanced AI for natural, helpful responses
- **Context Awareness**: Remembers conversation history and user context
- **Streaming Responses**: Real-time text generation for better UX
- **Fallback Mechanism**: Gracefully degrades to rule-based responses if API is unavailable

### 💬 Smart Conversations
- **Conversation Memory**: Maintains context across multiple messages
- **Dynamic Suggestions**: Context-aware quick questions based on conversation
- **User Profiling**: Adapts responses based on user role (creator/recipient)
- **Multi-turn Dialogues**: Handles complex, multi-step queries

### 🎨 Enhanced UI
- **Modern Design**: Clean, professional interface with smooth animations
- **Status Indicators**: Shows ASI:One connection status
- **Streaming Animations**: Visual feedback during AI response generation
- **Responsive Layout**: Works seamlessly on desktop and mobile

## Setup

### 1. Environment Configuration

Add the following to your `.env.local` file:

```bash
# ASI:One API Configuration
ASIONE_API_KEY=your_actual_api_key_here
NEXT_PUBLIC_ASIONE_API_URL=https://api.asione.ai/v1
NEXT_PUBLIC_ASIONE_MODEL=asione-one
```

### 2. API Key Requirements

To use ASI:One features:
1. Obtain an API key from the ASI:One platform
2. Add it to your environment variables
3. The chatbot will automatically detect and use the API

**Note**: Without an API key, the chatbot will operate in "Basic Mode" using rule-based responses.

## Usage

### Basic Usage

1. **Open the Chatbot**: Click the chat button in the bottom-right corner
2. **Ask Questions**: Type your question about token vesting, streams, or platform features
3. **Get Responses**: Receive intelligent, context-aware answers
4. **Follow-up**: Continue the conversation with related questions

### Example Conversations

#### Creating Streams
```
User: How do I create a stream?
AI: To create a stream, go to the Create Stream tab. You can choose between:
• Linear Vesting — tokens unlock gradually over a duration
• Cliff Vesting — tokens are locked until a cliff date, then released
• Milestone-Based — tokens unlock per milestone you approve

You can also bulk-create via CSV upload for multiple recipients at once!
```

#### Understanding Vesting Types
```
User: What's the difference between linear and cliff vesting?
AI: **Linear Vesting**: Tokens unlock continuously from start to end timestamp. Great for gradual token release.

**Cliff Vesting**: Tokens are locked until a cliff date, then all unlock at once (or linearly after cliff). Perfect for time-based milestones.

The main difference is the unlock pattern — linear is continuous, cliff has a waiting period.
```

#### Troubleshooting
```
User: My transaction failed. What should I do?
AI: I can help you troubleshoot transaction failures. Common issues include:

1. **Insufficient SOL**: Make sure you have enough for rent and fees
2. **Invalid Stream PDA**: Verify the stream address is correct
3. **Network Issues**: Check your Solana cluster connection

Could you share the error message or transaction signature? I can provide more specific help.
```

### Quick Questions

The chatbot suggests relevant questions based on:
- Current conversation context
- User role (creator/recipient)
- Common platform tasks

Click any suggestion to instantly ask that question.

## Features in Detail

### Context Awareness

The chatbot maintains context about:
- **Conversation History**: Previous questions and answers
- **User Profile**: Wallet connection, cluster, role
- **Current Action**: What the user is currently doing
- **Platform State**: Active streams, recent transactions

This enables more personalized and relevant responses.

### Streaming Responses

When using ASI:One, responses stream in real-time:
- **Immediate Feedback**: See responses as they're generated
- **Better UX**: No waiting for complete responses
- **Natural Flow**: Mimics human conversation patterns

### Error Handling

The chatbot handles various error scenarios:
- **API Unavailable**: Falls back to rule-based responses
- **Network Issues**: Shows helpful error messages
- **Invalid Input**: Provides guidance for correct usage
- **Rate Limiting**: Manages API rate limits gracefully

## Architecture

### Components

1. **ASIOneChatService** (`lib/asione-chat.ts`)
   - API integration layer
   - Context management
   - Response generation
   - Error handling

2. **EnhancedChatbot** (`components/dashboard/enhanced-chatbot.tsx`)
   - UI component
   - State management
   - User interactions
   - Visual feedback

### Data Flow

```
User Input → Chat Context → ASI:One API → Streaming Response → UI Display
     ↓              ↓              ↓               ↓              ↓
  Message      History      API Call        Chunks        Render
```

## Customization

### Modifying System Prompt

Edit the `systemPrompt` in `lib/asione-chat.ts` to customize the AI's behavior:

```typescript
this.systemPrompt = `You are an AI assistant for the Unified Flow platform...
// Add your custom instructions here
`;
```

### Adding Custom Responses

Extend the `getFallbackResponse` method to add more rule-based responses:

```typescript
private getFallbackResponse(userMessage: string): string {
  // Add your custom patterns
  if (lowerMessage.includes('your_keyword')) {
    return "Your custom response here";
  }
  // ... existing patterns
}
```

### Styling

Modify the component in `components/dashboard/enhanced-chatbot.tsx` to customize:
- Colors and themes
- Layout and spacing
- Animations and transitions
- Responsive behavior

## Troubleshooting

### Chatbot Shows "Basic Mode"

**Cause**: ASI:One API key is not configured

**Solution**: 
1. Check your `.env.local` file
2. Ensure `ASIONE_API_KEY` is set correctly
3. Restart the development server

### Responses Are Slow

**Cause**: API latency or network issues

**Solution**:
1. Check your internet connection
2. Verify ASI:One API status
3. Consider implementing response caching

### Streaming Not Working

**Cause**: Browser or API compatibility issues

**Solution**:
1. Ensure you're using a modern browser
2. Check API response format
3. Verify streaming is enabled in API configuration

## Performance Considerations

### Optimization Tips

1. **Limit History**: The chatbot maintains a limited conversation history
2. **Cache Responses**: Consider caching common questions
3. **Debounce Input**: Implement debouncing for rapid inputs
4. **Lazy Loading**: The component uses dynamic imports

### Monitoring

Monitor:
- API response times
- Error rates
- User engagement
- Common questions

## Future Enhancements

Potential improvements:
- **Voice Input**: Add speech-to-text capabilities
- **Multilingual Support**: Support multiple languages
- **Advanced Analytics**: Track conversation patterns
- **Integration**: Connect with other platform features
- **Custom Training**: Fine-tune for specific use cases

## Support

For issues or questions:
1. Check this guide
2. Review the code comments
3. Test with the API key
4. Contact the development team

## License

This component is part of the Unified Flow platform and follows the project's license terms.
