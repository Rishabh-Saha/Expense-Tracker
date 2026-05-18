import React from 'react';
import { View, Text } from 'react-native';
import { FONTS, SPACING } from '../constants/theme';

// Renders inline **bold** within a text string
function InlineText({ text, style }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <Text key={i} style={[style, { fontWeight: '700' }]}>{part.slice(2, -2)}</Text>
          : <Text key={i}>{part}</Text>
      )}
    </Text>
  );
}

export default function MarkdownText({ text, style }) {
  if (!text) return null;

  // Collapse 3+ newlines to 2, trim edges
  const normalized = text.replace(/\n{3,}/g, '\n\n').trim();
  const blocks = normalized.split('\n\n');

  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isList = lines.every(l => /^[-•*]\s/.test(l.trim()) || !l.trim());

        if (isList) {
          return (
            <View key={bi} style={{ gap: 3 }}>
              {lines.filter(l => l.trim()).map((line, li) => {
                const content = line.replace(/^[-•*]\s*/, '');
                return (
                  <View key={li} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Text style={[style, { marginRight: 8, marginTop: 1, fontSize: FONTS.md }]}>•</Text>
                    <InlineText text={content} style={[style, { flex: 1, lineHeight: 21 }]} />
                  </View>
                );
              })}
            </View>
          );
        }

        // Plain paragraph — may have inline bold
        return (
          <InlineText
            key={bi}
            text={block.replace(/\n/g, ' ')}
            style={[style, { lineHeight: 21 }]}
          />
        );
      })}
    </View>
  );
}
