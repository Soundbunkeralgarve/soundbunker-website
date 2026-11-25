import React from 'react';
import {Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useFonts} from 'expo-font';
import {C, F} from './src/theme.js';
import {Loading} from './src/components/ui.js';
import {OrganiserProvider, useOrganiser} from './src/state.js';
import SignInScreen from './src/screens/SignInScreen.js';
import EventsScreen from './src/screens/EventsScreen.js';
import AccountScreen from './src/screens/AccountScreen.js';
import EventFormScreen from './src/screens/EventFormScreen.js';
import TiersScreen from './src/screens/TiersScreen.js';
import StaffScreen from './src/screens/StaffScreen.js';
import GuestsScreen from './src/screens/GuestsScreen.js';
import DeleteAccountScreen from './src/screens/DeleteAccountScreen.js';
import EventDashboard from './src/components/EventDashboard.js';

const Stack = createNativeStackNavigator(), Tab = createBottomTabNavigator();
const theme = {...DarkTheme, fonts: {...DarkTheme.fonts, regular: {...DarkTheme.fonts.regular, fontFamily: F.body}, medium: {...DarkTheme.fonts.medium, fontFamily: F.medium}, bold: {...DarkTheme.fonts.bold, fontFamily: F.bold}, heavy: {...DarkTheme.fonts.heavy, fontFamily: F.display}}, colors: {...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.teal, text: C.text, border: C.line}};
const icon = glyph => ({color}) => <Text style={{color, fontSize: 22}}>{glyph}</Text>;
const EventScreen = ({route, navigation}) => <EventDashboard id={route.params.id} navigation={navigation}/>;

function Tabs() {
  return <Tab.Navigator screenOptions={{headerShown: false, tabBarActiveTintColor: C.teal, tabBarInactiveTintColor: C.muted,
    tabBarStyle: {backgroundColor: C.card, borderTopColor: C.line}, tabBarLabelPosition: 'below-icon', tabBarLabelStyle: {fontFamily: F.bold, fontSize: 14}}}>
    <Tab.Screen name="Events" component={EventsScreen} options={{tabBarIcon: icon('▦')}}/>
    <Tab.Screen name="Account" component={AccountScreen} options={{tabBarIcon: icon('◉')}}/>
  </Tab.Navigator>;
}
function Root() {
  const org = useOrganiser();
  if (org.session === undefined) return <View style={{flex: 1, backgroundColor: C.bg}}><Loading label="Restoring your sign-in…"/></View>;
  if (!org.session) return <SignInScreen/>;
  return <Stack.Navigator screenOptions={{headerStyle: {backgroundColor: C.bg}, headerTintColor: C.teal, headerTitleStyle: {fontFamily: F.heading, fontSize: 24, color: C.text}, contentStyle: {backgroundColor: C.bg}, headerBackButtonDisplayMode: 'minimal'}}>
    <Stack.Screen name="Tabs" component={Tabs} options={{headerShown: false}}/>
    <Stack.Screen name="Event" component={EventScreen} options={{title: ''}}/>
    <Stack.Screen name="EventForm" component={EventFormScreen}/>
    <Stack.Screen name="Tiers" component={TiersScreen}/>
    <Stack.Screen name="Staff" component={StaffScreen}/>
    <Stack.Screen name="Guests" component={GuestsScreen}/>
    <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen}/>
  </Stack.Navigator>;
}
export default function App() {
  const [fonts] = useFonts({
    BarlowCondensed_900Black: require('./assets/fonts/BarlowCondensed_900Black.ttf'),
    BarlowCondensed_700Bold: require('./assets/fonts/BarlowCondensed_700Bold.ttf'),
    DMSans_400Regular: require('./assets/fonts/DMSans_400Regular.ttf'),
    DMSans_500Medium: require('./assets/fonts/DMSans_500Medium.ttf'),
    DMSans_600SemiBold: require('./assets/fonts/DMSans_600SemiBold.ttf'),
    DMSans_700Bold: require('./assets/fonts/DMSans_700Bold.ttf')
  });
  if (!fonts) return <View style={{flex: 1, backgroundColor: C.bg}}/>;
  return <SafeAreaProvider><OrganiserProvider>
    <NavigationContainer theme={theme}><StatusBar style="light"/><Root/></NavigationContainer>
  </OrganiserProvider></SafeAreaProvider>;
}
