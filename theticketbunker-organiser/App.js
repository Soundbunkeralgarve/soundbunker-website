import React from 'react';
import {Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {useFonts, BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold} from '@expo-google-fonts/bricolage-grotesque';
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
import EventDashboard from './src/components/EventDashboard.js';

const Stack = createNativeStackNavigator(), Tab = createBottomTabNavigator();
const theme = {...DarkTheme, colors: {...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.teal, text: C.text, border: C.line}};
const icon = glyph => ({color}) => <Text style={{color, fontSize: 22}}>{glyph}</Text>;
const EventScreen = ({route, navigation}) => <EventDashboard id={route.params.id} navigation={navigation}/>;

function Tabs() {
  return <Tab.Navigator screenOptions={{headerShown: false, tabBarActiveTintColor: C.teal, tabBarInactiveTintColor: C.muted,
    tabBarStyle: {backgroundColor: '#0b1418', borderTopColor: C.line}, tabBarLabelPosition: 'below-icon', tabBarLabelStyle: {fontFamily: F.bold, fontSize: 13}}}>
    <Tab.Screen name="Events" component={EventsScreen} options={{tabBarIcon: icon('▦')}}/>
    <Tab.Screen name="Account" component={AccountScreen} options={{tabBarIcon: icon('◉')}}/>
  </Tab.Navigator>;
}
function Root() {
  const org = useOrganiser();
  if (org.session === undefined) return <View style={{flex: 1, backgroundColor: C.bg}}><Loading label="Restoring your sign-in…"/></View>;
  if (!org.session) return <SignInScreen/>;
  return <Stack.Navigator screenOptions={{headerStyle: {backgroundColor: C.bg}, headerTintColor: C.teal, headerTitleStyle: {fontFamily: F.bold, color: C.text}, contentStyle: {backgroundColor: C.bg}, headerBackButtonDisplayMode: 'minimal'}}>
    <Stack.Screen name="Tabs" component={Tabs} options={{headerShown: false}}/>
    <Stack.Screen name="Event" component={EventScreen} options={{title: ''}}/>
    <Stack.Screen name="EventForm" component={EventFormScreen}/>
    <Stack.Screen name="Tiers" component={TiersScreen}/>
    <Stack.Screen name="Staff" component={StaffScreen}/>
    <Stack.Screen name="Guests" component={GuestsScreen}/>
  </Stack.Navigator>;
}
export default function App() {
  const [fonts] = useFonts({BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold});
  if (!fonts) return <View style={{flex: 1, backgroundColor: C.bg}}/>;
  return <SafeAreaProvider><OrganiserProvider>
    <NavigationContainer theme={theme}><StatusBar style="light"/><Root/></NavigationContainer>
  </OrganiserProvider></SafeAreaProvider>;
}
