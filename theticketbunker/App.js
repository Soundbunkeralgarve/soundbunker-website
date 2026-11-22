import React from 'react';
import {Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useFonts, BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold} from '@expo-google-fonts/bricolage-grotesque';
import {C, F} from './src/theme.js';
import {TripProvider, AuthProvider, useTrip} from './src/state.js';
import HomeScreen from './src/screens/HomeScreen.js';
import PlacesScreen from './src/screens/PlacesScreen.js';
import TripScreen from './src/screens/TripScreen.js';
import TicketsScreen from './src/screens/TicketsScreen.js';
import ResultsScreen from './src/screens/ResultsScreen.js';
import CityScreen from './src/screens/CityScreen.js';
import TicketScreen from './src/screens/TicketScreen.js';
import VipScreen from './src/screens/VipScreen.js';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen.js';
import EventDetail from './src/components/EventDetail.js';

const Stack = createNativeStackNavigator(), Tab = createBottomTabNavigator();
const theme = {...DarkTheme, colors: {...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.teal, text: C.text, border: C.line}};
const icon = glyph => ({color}) => <Text style={{color, fontSize: 22}}>{glyph}</Text>;

function Tabs() {
  const {trip} = useTrip();
  return <Tab.Navigator screenOptions={{headerShown: false, tabBarActiveTintColor: C.teal, tabBarInactiveTintColor: C.muted,
    tabBarStyle: {backgroundColor: '#0b1418', borderTopColor: C.line}, tabBarLabelPosition: 'below-icon',
    tabBarLabelStyle: {fontFamily: F.bold, fontSize: 13}}}>
    <Tab.Screen name="Discover" component={HomeScreen} options={{tabBarIcon: icon('⌂')}}/>
    <Tab.Screen name="Places" component={PlacesScreen} options={{tabBarIcon: icon('◎')}}/>
    <Tab.Screen name="Trip" component={TripScreen} options={{title: 'My trip', tabBarIcon: icon('☆'), tabBarBadge: trip.length || undefined, tabBarBadgeStyle: {backgroundColor: C.teal, color: C.tealInk}}}/>
    <Tab.Screen name="Tickets" component={TicketsScreen} options={{title: 'Tickets', tabBarIcon: icon('▤')}}/>
  </Tab.Navigator>;
}
const EventScreen = ({route, navigation}) => <EventDetail item={route.params.item} onOpenTrip={() => navigation.navigate('Tabs', {screen: 'Trip'})}/>;

export default function App() {
  const [fonts] = useFonts({BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold});
  if (!fonts) return <View style={{flex: 1, backgroundColor: C.bg}}/>;
  return <SafeAreaProvider><AuthProvider><TripProvider>
    <NavigationContainer theme={theme} linking={{prefixes: ['theticketbunker://', 'https://theticketbunker.com']}}>
      <StatusBar style="light"/>
      <Stack.Navigator screenOptions={{headerStyle: {backgroundColor: C.bg}, headerTintColor: C.teal, headerTitleStyle: {fontFamily: F.bold, color: C.text}, contentStyle: {backgroundColor: C.bg}, headerBackButtonDisplayMode: 'minimal'}}>
        <Stack.Screen name="Tabs" component={Tabs} options={{headerShown: false}}/>
        <Stack.Screen name="Results" component={ResultsScreen} options={{title: 'Events'}}/>
        <Stack.Screen name="City" component={CityScreen}/>
        <Stack.Screen name="Event" component={EventScreen} options={{title: ''}}/>
        <Stack.Screen name="Ticket" component={TicketScreen} options={{title: 'Your ticket'}}/>
        <Stack.Screen name="Vip" component={VipScreen} options={{title: 'TicketBunker VIP'}}/>
        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{title: 'Delete my account'}}/>
      </Stack.Navigator>
    </NavigationContainer>
  </TripProvider></AuthProvider></SafeAreaProvider>;
}
