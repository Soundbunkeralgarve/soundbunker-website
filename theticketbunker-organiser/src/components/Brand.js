import React from 'react';
import {Image} from 'expo-image';

// The same undistorted TicketBunker wordmark used in the website header.
export default function Brand({compact = false}) {
  return <Image source={require('../../assets/brand-logo.png')} contentFit="contain" accessible accessibilityLabel="The TicketBunker"
    style={{width: compact ? 190 : 240, height: compact ? 31 : 39, maxWidth: '100%', alignSelf: 'flex-start'}}/>;
}
