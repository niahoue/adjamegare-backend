// src/services/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import moment from 'moment';
import 'moment/locale/fr.js';
moment.locale('fr');

dotenv.config();

const FRONTEND_BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';


const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Envoie un email de confirmation de réservation.
 * Assurez-vous que l'objet 'reservation' passé en paramètre
 * a les champs 'user', 'outboundTrip', et 'returnTrip' (si applicable) populés.
 * @param {object} reservation - L'objet complet de la réservation avec les détails populés.
 * @returns {Promise<object>} - Informations sur le message envoyé.
 */
export const sendReservationConfirmationEmail = async (reservation) => {
    if (!reservation || !reservation.user || !reservation.user.email || !reservation.outboundTrip) {
        console.error('[EmailService] Données de réservation insuffisantes pour envoyer l\'email.');
        throw new Error('Données de réservation insuffisantes (utilisateur ou trajet aller manquant) pour envoyer l\'email.');
    }

    const toEmail = reservation.user.email;
    const departureCityName = reservation.outboundTrip?.departureCity?.name || 'Ville de départ inconnue';
    const arrivalCityName = reservation.outboundTrip?.arrivalCity?.name || 'Ville d\'arrivée inconnue';

    const emailContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Confirmation de réservation AdjameGare</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; }
                h1 { color: #28a745; text-align: center; }
                h2 { color: #0056b3; }
                ul { list-style-type: none; padding: 0; }
                li { margin-bottom: 8px; }
                .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #777; }
                .highlight { font-weight: bold; color: #007bff; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎉 Votre réservation est confirmée ! 🎉</h1>
                <p>Cher(ère) ${reservation.user.firstName || ''} ${reservation.user.lastName || ''},</p>
                <p>Merci d'avoir choisi <span class="highlight">AdjameGare</span> pour votre voyage.</p>
                <p>Voici les détails de votre réservation (Référence : <span class="highlight">${reservation._id}</span>) :</p>
                
                <h2>Détails du Trajet Aller :</h2>
                <ul>
                    <li><strong>Compagnie :</strong> ${reservation.outboundTrip?.company?.name || 'N/A'}</li>
                    <li><strong>Trajet :</strong> <span class="highlight">${departureCityName}</span> (${reservation.outboundTrip?.departureStation || 'N/A'}) → <span class="highlight">${arrivalCityName}</span> (${reservation.outboundTrip?.arrivalStation || 'N/A'})</li>
                    <li><strong>Date :</strong> ${moment(reservation.outboundTrip?.departureDate).format('DD MMMMYYYY')}</li>
                    <li><strong>Heure de départ :</strong> ${reservation.outboundTrip?.departureTime}</li>
                    <li><strong>Classe :</strong> ${reservation.travelClass ? reservation.travelClass.charAt(0).toUpperCase() + reservation.travelClass.slice(1) : 'N/A'}</li>
                    <li><strong>Siège(s) sélectionné(s) :</strong> ${reservation.selectedSeats.join(', ')}</li>
                </ul>

                ${reservation.returnTrip ? `
                <h2>Détails du Trajet Retour :</h2>
                <ul>
                    <li><strong>Compagnie :</strong> ${reservation.returnTrip?.company?.name || 'N/A'}</li>
                    <li><strong>Trajet :</strong> <span class="highlight">${arrivalCityName}</span> (${reservation.returnTrip?.departureStation || 'N/A'}) → <span class="highlight">${departureCityName}</span> (${reservation.returnTrip?.arrivalStation || 'N/A'})</li>
                    <li><strong>Date :</strong> ${moment(reservation.returnTrip?.departureDate).format('DD MMMMYYYY')}</li>
                    <li><strong>Heure de départ :</strong> ${reservation.returnTrip?.departureTime}</li>
                </ul>
                ` : ''}

                <h2>Récapitulatif du Paiement :</h2>
                <ul>
                    <li><strong>Montant Total Payé :</strong> <span class="highlight">${reservation.totalPrice?.toLocaleString('fr-FR')} FCFA</span></li>
                    <li><strong>Méthode de Paiement :</strong> ${reservation.paymentMethod || 'CinetPay'}</li>
                    <li><strong>Statut du Paiement :</strong> Confirmé</li>
                    <li><strong>Référence CinetPay :</strong> ${reservation.cinetpayTransactionId || 'N/A'}</li>
                </ul>

                <p>Vous recevrez un rappel par email avant votre départ. Vous pouvez également consulter tous les détails de votre réservation en vous connectant à votre espace personnel sur notre site.</p>
                
                <p>Nous vous souhaitons un agréable voyage !</p>
                
                <div class="footer">
                    <p>Cordialement,<br>L'équipe AdjameGare</p>
                    <p><a href="${FRONTEND_BASE_URL}">adjamegare.com</a></p>
                </div>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: `AdjameGare <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Confirmation de votre réservation AdjameGare - Trajet ${departureCityName} → ${arrivalCityName}`,
        html: emailContent,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return info;
    } catch (error) {
        throw new Error('Erreur lors de l\'envoi de l\'email de confirmation.');
    }
};

/**
 * Envoie un email de réinitialisation de mot de passe
 * @param {object} user - L'objet utilisateur
 * @param {string} resetUrl - Le lien de réinitialisation du mot de passe
 */
export const sendResetPasswordEmail = async (user, resetUrl) => {


  const mailOptions = {
    from: `"Adjamegare" <${process.env.EMAIL_FROM}>`,
    to: user.email,
    subject: 'Réinitialisation de mot de passe - Adjamegare',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #F46A21; text-align: center;">Réinitialisation de votre mot de passe</h1>
        <p>Bonjour <strong>${user.firstName || ''}</strong>,</p> <!-- Correction ici -->
        <p>Vous recevez cet e-mail car vous avez demandé la réinitialisation de votre mot de passe sur Adjamegare.</p>
        <p>Veuillez cliquer sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}"
             style="background-color: #F46A21; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p><strong>⚠️ Ce lien expirera dans 1 heure.</strong></p> <!-- Correction ici -->
        <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.</p>
        <hr style="margin: 30px 0;">
        <p style="text-align: center; color: #666; font-size: 14px;">
          L'équipe Adjamegare <br>
          <em>Votre site de réservation en ligne de confiance</em>
        </p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('❌ Erreur détaillée lors de l\'envoi de l\'email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });

    // Relancer l'erreur avec plus de détails
    throw new Error(`Échec de l'envoi de l'email: ${error.message}`);
  }
};
