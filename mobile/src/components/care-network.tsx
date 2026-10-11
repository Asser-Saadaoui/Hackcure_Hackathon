import { Building2, Hospital, Siren, Stethoscope, UserRound } from 'lucide-react-native';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText } from './app-text';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';

/** Native companion to the web beam diagram: static, readable care routes without DOM dependencies. */
export function CareNetwork() {
  const { language, rtl } = useI18n();
  const copy = (key: keyof typeof EXPERIENCE.en) => EXPERIENCE[language][key];
  const routes = [
    { Icon: Hospital, label: copy('careHospital') }, { Icon: Building2, label: copy('careClinic') },
    { Icon: Siren, label: copy('careEmergency') }, { Icon: Stethoscope, label: copy('careDoctor') },
  ];
  return <View style={styles.card}>
    <AppText variant="subtitle">{copy('careTitle')}</AppText>
    <View style={styles.map}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 300 240" preserveAspectRatio="none" style={rtl ? { transform:[{ scaleX:-1 }] } : undefined}>
          <Path d="M 38 120 L 139 120" stroke="#C6D7ED" strokeWidth={2} />
          {[30,90,150,210].map(y => <Path key={y} d={`M 139 120 Q 185 120 216 ${y}`} fill="none" stroke="#C6D7ED" strokeWidth={2} />)}
        </Svg>
      </View>
      <View style={styles.person}><View style={styles.circle}><UserRound size={23} color={Colors.primary} /></View><AppText variant="small">{copy('careYou')}</AppText></View>
      <View style={styles.person}><View style={styles.circle}><Image source={require('../../assets/images/hassanito.png')} style={{width:40,height:40}} resizeMode="contain" accessible={false} /></View><AppText variant="small">Sahhanito</AppText></View>
      <View style={styles.options}>{routes.map(({Icon,label},index) => <View key={label} style={styles.option}><Icon size={18} color={index===2 ? Colors.destructive : Colors.primary} /><AppText variant="small" style={{fontSize:11,flex:1}}>{label}</AppText></View>)}</View>
    </View>
    <AppText variant="small">{copy('careNote')}</AppText>
  </View>;
}
const styles = StyleSheet.create({
  card:{padding:18,borderRadius:24,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.card,gap:12},
  map:{minHeight:240,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  person:{flex:1,alignItems:'center',gap:8},circle:{width:48,height:48,borderRadius:24,backgroundColor:'#F0F6FF',borderWidth:1,borderColor:Colors.border,alignItems:'center',justifyContent:'center'},
  options:{flex:1.4,gap:12},option:{height:48,flexDirection:'row',alignItems:'center',gap:6,padding:7,borderWidth:1,borderColor:Colors.border,borderRadius:12,backgroundColor:Colors.card},
});
