import { Building2, Hospital, Siren, Stethoscope, UserRound } from 'lucide-react-native';
import { useRef, type RefObject } from 'react';
import { Image } from 'react-native';

import { AnimatedBeam } from './animated-beam.web';
import { useI18n } from '@/i18n';
import { EXPERIENCE } from '@/i18n/experience';

export function CareNetwork() {
  const { language, rtl } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const patient = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const hospital = useRef<HTMLDivElement>(null);
  const clinic = useRef<HTMLDivElement>(null);
  const emergency = useRef<HTMLDivElement>(null);
  const doctor = useRef<HTMLDivElement>(null);
  const copy = (key: keyof typeof EXPERIENCE.en) => EXPERIENCE[language][key];
  return <section className="care-network" dir={rtl ? 'rtl' : 'ltr'} aria-labelledby="care-network-title">
    <style>{`
      .care-network { border:1px solid #DDE6F1; border-radius:24px; background:linear-gradient(115deg,#fff,#F5F9FF); padding:22px 26px; color:#183455; font-family:Inter_400Regular,Arial,sans-serif; }
      .care-network h2 { margin:0; font-size:17px; line-height:26px; font-weight:600; letter-spacing:-.2px; }
      .care-network p { margin:14px 0 0; font-size:12px; line-height:19px; color:#56667C; }
      .care-network-map { position:relative; display:grid; grid-template-columns:1fr 1fr 1.4fr; align-items:center; gap:26px; min-height:244px; margin-top:12px; }
      .care-network-person,.care-network-hub { display:flex; flex-direction:column; align-items:center; gap:10px; z-index:1; text-align:center; font-size:13px; font-weight:600; }
      .care-network-circle { width:58px; height:58px; border:1px solid #D8E4F4; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 16px #142D5008; }
      .care-network-hub .care-network-circle { width:72px; height:72px; border:5px solid #E8F2FF; outline:1px solid #C8DDF8; }
      .care-network-options { display:grid; gap:10px; position:relative; z-index:1; }
      .care-network-option { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid #DFE8F4; border-radius:14px; background:#fff; font-size:13px; font-weight:500; }
      .care-network-option-icon { display:flex; align-items:center; justify-content:center; width:30px; height:30px; flex-shrink:0; border-radius:9px; background:#F0F6FF; }
      .care-network-option.is-urgent .care-network-option-icon { background:#FFF0F2; }
      .care-network[dir=rtl] { font-family:Arial,sans-serif; }
      @media(max-width:600px) { .care-network { padding:18px 14px; } .care-network-map { gap:12px; grid-template-columns:.8fr 1fr 1.3fr; } .care-network-option { padding:9px 7px; gap:5px; font-size:11px; } .care-network-option-icon { width:24px; height:28px; } .care-network-circle { width:44px; height:44px; } .care-network-hub .care-network-circle { width:54px; height:54px; } .care-network-person,.care-network-hub { font-size:11px; } }
    `}</style>
    <h2 id="care-network-title">{copy('careTitle')}</h2>
    <div ref={container} className="care-network-map">
      {/* Remount measured paths when direction changes even if all node sizes stay identical. */}
      <AnimatedBeam key={`patient-${rtl}`} containerRef={container} fromRef={patient} toRef={hub} duration={5} />
      <AnimatedBeam key={`hospital-${rtl}`} containerRef={container} fromRef={hub} toRef={hospital} curvature={30} />
      <AnimatedBeam key={`clinic-${rtl}`} containerRef={container} fromRef={hub} toRef={clinic} curvature={10} delay={.6} />
      <AnimatedBeam key={`emergency-${rtl}`} containerRef={container} fromRef={hub} toRef={emergency} curvature={-10} delay={1.2} gradientStartColor="#E85466" gradientStopColor="#F0A8AE" />
      <AnimatedBeam key={`doctor-${rtl}`} containerRef={container} fromRef={hub} toRef={doctor} curvature={-30} delay={1.8} />
      <div className="care-network-person"><div ref={patient} className="care-network-circle"><UserRound size={25} color="#245CAF" /></div><span>{copy('careYou')}</span></div>
      <div className="care-network-hub"><div ref={hub} className="care-network-circle"><Image source={require('../../assets/images/hassanito.png')} style={{ width:42, height:42 }} resizeMode="contain" accessible={false} /></div><span>Sahhanito</span></div>
      <div className="care-network-options">
        <CareOption nodeRef={hospital} Icon={Hospital} label={copy('careHospital')} />
        <CareOption nodeRef={clinic} Icon={Building2} label={copy('careClinic')} />
        <CareOption nodeRef={emergency} Icon={Siren} label={copy('careEmergency')} urgent />
        <CareOption nodeRef={doctor} Icon={Stethoscope} label={copy('careDoctor')} />
      </div>
    </div>
    <p>{copy('careNote')}</p>
  </section>;
}

function CareOption({ nodeRef, Icon, label, urgent = false }: { nodeRef: RefObject<HTMLDivElement | null>; Icon: typeof Hospital; label: string; urgent?: boolean }) {
  return <div className={`care-network-option${urgent ? ' is-urgent' : ''}`}>
    <div ref={nodeRef} className="care-network-option-icon"><Icon size={18} color={urgent ? '#C52020' : '#245CAF'} /></div><span>{label}</span>
  </div>;
}
